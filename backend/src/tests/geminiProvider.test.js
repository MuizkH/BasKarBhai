import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { GeminiProvider } from '../services/llm/geminiProvider.js';
import { llmFactory } from '../services/llm/llmFactory.js';
import { LlmResponseSchema } from '../services/llm/llmProvider.js';

describe('Gemini LLM Provider & Integration Suite', () => {
  const standardContext = {
    message: 'Give me five more minutes on Instagram',
    history: [
      { role: 'user', content: 'I am bored' },
      { role: 'assistant', content: 'What was your main goal today?' }
    ],
    profile: {
      goals: ['Reduce Instagram Reels consumption', 'Study Java'],
      preferredPersonality: 'honest, supportive friend'
    },
    behaviouralMemory: {
      frequentlyRequestedExtensions: { totalRequests: 1, grantedCount: 1 }
    },
    commitments: [{ id: 'c1', description: 'Study Java', status: 'pending' }],
    interventionState: { interventionId: 'int_gemini_1' },
    accountabilityLevel: { violationCount: 1, warningIssued: true, restrictionActive: false },
    extensionResult: { granted: true, minutes: 10 }
  };

  // Helper to create mocked GoogleGenAI client
  const createMockGeminiClient = ({
    responseObj = null,
    rawText = null,
    delayMs = 0,
    shouldThrow = null
  }) => {
    return {
      models: {
        generateContent: async (params) => {
          if (delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
          if (shouldThrow) {
            throw shouldThrow;
          }
          return {
            text: rawText !== null ? rawText : JSON.stringify(responseObj)
          };
        }
      }
    };
  };

  // 1. Factory selection
  test('Factory selection: Correctly selects and returns GeminiProvider instance', () => {
    const provider = llmFactory.getProvider('gemini');
    assert.ok(provider instanceof GeminiProvider, 'Must be an instance of GeminiProvider');
    assert.strictEqual(provider.name, 'gemini');
  });

  // 2. Successful Gemini response
  test('Successful Gemini response: Parses and validates structured JSON conforming to schema', async () => {
    const validGeminiJson = {
      response:
        "Alright, you've got your 10-minute extension. Wrap up this reel, and let's get back to studying Java as you promised.",
      emotion: 'supportive',
      intent: 'negotiate',
      suggestedAction: 'request_commitment',
      commitment: null,
      extensionRequested: true
    };

    const mockClient = createMockGeminiClient({ responseObj: validGeminiJson });
    const provider = new GeminiProvider({ apiKey: 'fake-test-key', client: mockClient });

    const result = await provider.generateResponse(standardContext);

    assert.strictEqual(result._fallback, undefined, 'Must not be a fallback response');
    assert.strictEqual(result.response, validGeminiJson.response);
    assert.strictEqual(result.emotion, 'supportive');
    assert.strictEqual(result.intent, 'negotiate');
    assert.strictEqual(result.suggestedAction, 'request_commitment');
    assert.strictEqual(result.extensionRequested, true);

    const parseCheck = LlmResponseSchema.safeParse(result);
    assert.strictEqual(parseCheck.success, true, 'Result must pass Zod schema check');
  });

  // 3. Malformed response handling
  test('Malformed response: Non-JSON or broken text from Gemini triggers safe fallback with metadata', async () => {
    const mockClient = createMockGeminiClient({ rawText: 'I am not JSON at all {{ broken }}' });
    const provider = new GeminiProvider({ apiKey: 'fake-test-key', client: mockClient });

    // With fallbackOnError: false, must throw MalformedJsonError
    await assert.rejects(
      async () => {
        await provider.generateResponse(standardContext, { fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'MalformedJsonError');
        return true;
      }
    );

    // With fallbackOnError: true, returns fallback with identifying metadata
    const fallback = await provider.generateResponse(standardContext, { fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true, 'Must have _fallback metadata flag');
    assert.strictEqual(fallback._provider, 'gemini', 'Must specify gemini as provider');
    assert.ok(fallback._reason.includes('Malformed JSON'), 'Must explain reason');
    assert.ok(LlmResponseSchema.safeParse(fallback).success, 'Fallback must be schema-compliant');
  });

  // 4. Timeout handling
  test('Timeout: Gemini API call exceeding timeout threshold triggers safe fallback', async () => {
    const mockClient = createMockGeminiClient({
      responseObj: { response: 'delayed' },
      delayMs: 200
    });
    const provider = new GeminiProvider({ apiKey: 'fake-test-key', client: mockClient });

    // With fallbackOnError: false
    await assert.rejects(
      async () => {
        await provider.generateResponse(standardContext, { timeoutMs: 50, fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'TimeoutError');
        assert.match(err.message, /timed out after 50ms/i);
        return true;
      }
    );

    // With fallbackOnError: true
    const fallback = await provider.generateResponse(standardContext, {
      timeoutMs: 50,
      fallbackOnError: true
    });
    assert.strictEqual(fallback._fallback, true);
    assert.strictEqual(fallback._provider, 'gemini');
    assert.match(fallback._reason, /timed out/i);
    assert.ok(LlmResponseSchema.safeParse(fallback).success);
  });

  // 5. Missing API key handling
  test('Missing API key: Throws clear configuration error or returns fallback with metadata', async () => {
    // Explicitly nullify apiKey
    const provider = new GeminiProvider({ apiKey: null, client: null });

    // With fallbackOnError: false
    await assert.rejects(
      async () => {
        await provider.generateResponse(standardContext, { fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'MissingApiKeyError');
        assert.match(err.message, /Gemini API key is missing/i);
        return true;
      }
    );

    // With fallbackOnError: true
    const fallback = await provider.generateResponse(standardContext, { fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true);
    assert.strictEqual(fallback._provider, 'gemini');
    assert.match(fallback._reason, /Gemini API key is missing/i);
  });

  // 6. Network failure / Rate limit handling
  test('Rate limit & Network errors: Properly classifies and handles upstream API errors', async () => {
    const rateLimitError = new Error('Resource has been exhausted (e.g. check quota).');
    rateLimitError.status = 429;

    const mockClient = createMockGeminiClient({ shouldThrow: rateLimitError });
    const provider = new GeminiProvider({ apiKey: 'fake-test-key', client: mockClient });

    await assert.rejects(
      async () => {
        await provider.generateResponse(standardContext, { fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'RateLimitError');
        return true;
      }
    );

    const fallback = await provider.generateResponse(standardContext, { fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true);
    assert.strictEqual(fallback._provider, 'gemini');
  });

  // 7. Accountability boundary preservation
  test('Accountability boundary: Prompt explicitly instructs boundary preservation', () => {
    const provider = new GeminiProvider({ apiKey: 'fake-test-key' });
    const { systemInstruction, userPrompt } = provider._buildPrompt(standardContext);

    assert.match(systemInstruction, /CANNOT directly enforce restrictions/i);
    assert.match(systemInstruction, /backend negotiation engine is authoritative/i);
    assert.match(userPrompt, /backendExtensionResult/i);
  });
});

