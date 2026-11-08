import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { llmFactory, HostedLlmProvider, GnaniEvonProvider } from '../services/llm/llmFactory.js';
import { BaseLlmProvider, LlmResponseSchema } from '../services/llm/llmProvider.js';
import mockLlmProvider, { MockLlmProvider } from '../services/llm/mockLlmProvider.js';
import conversationService from '../services/conversationService.js';
import accountabilityService from '../services/accountabilityService.js';
import negotiationService from '../services/negotiationService.js';

describe('LLM Provider Architecture & Reliability Suite', () => {
  beforeEach(() => {
    mockLlmProvider.clearSimulationMode();
    accountabilityService.clearAll();
    negotiationService.clearAll();
    conversationService.clearAll();
  });

  // 1. Provider selection
  test('Provider selection: Resolves mock, hosted, evon, gemini, and throws on unknown provider', () => {
    const mock = llmFactory.getProvider('mock');
    assert.ok(mock instanceof MockLlmProvider, 'Must resolve MockLlmProvider');
    assert.strictEqual(mock.name, 'mock');

    const hosted = llmFactory.getProvider('hosted');
    assert.ok(hosted instanceof HostedLlmProvider, 'Must resolve HostedLlmProvider');
    assert.strictEqual(hosted.name, 'hosted');

    const evon = llmFactory.getProvider('evon');
    assert.ok(evon instanceof GnaniEvonProvider, 'Must resolve GnaniEvonProvider');
    assert.strictEqual(evon.name, 'evon');

    const gemini = llmFactory.getProvider('gemini');
    assert.ok(gemini !== null, 'Must resolve GeminiProvider');
    assert.strictEqual(gemini.name, 'gemini');

    // Unknown provider must throw clear configuration error (do not silently fall back)
    assert.throws(
      () => llmFactory.getProvider('unknown-future-provider'),
      /Unsupported LLM provider: 'unknown-future-provider'/i
    );
  });

  // 2. Valid structured responses conforming to Zod schema
  test('Valid structured response: Output strictly conforms to LlmResponseSchema', async () => {
    const provider = llmFactory.getProvider('mock');
    const context = {
      message: 'I want a 10-minute extension to finish this video',
      history: [],
      profile: { goals: ['Study Java'] },
      behaviouralMemory: {},
      commitments: [],
      interventionState: { interventionId: 'int_valid_1' },
      accountabilityLevel: { violationCount: 0, restrictionActive: false }
    };

    const result = await provider.generateResponse(context);

    // Validate using Zod schema
    const parseResult = LlmResponseSchema.safeParse(result);
    assert.strictEqual(parseResult.success, true, 'Result must pass Zod schema validation');

    assert.ok(typeof result.response === 'string' && result.response.length > 0);
    assert.ok(typeof result.emotion === 'string');
    assert.ok(typeof result.intent === 'string');
    assert.ok(typeof result.suggestedAction === 'string');
    assert.strictEqual(typeof result.extensionRequested, 'boolean');
  });

  // 3. Invalid JSON responses
  test('Invalid JSON response: Malformed JSON string is caught and safely handled', async () => {
    const provider = new MockLlmProvider();
    provider.setSimulationMode('invalid_json');

    const context = { message: 'hello' };

    // With fallbackOnError: false, must throw MalformedJsonError
    await assert.rejects(
      async () => {
        await provider.generateResponse(context, { fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'MalformedJsonError');
        return true;
      }
    );

    // With default fallbackOnError: true, returns compliant fallback response without crashing
    const fallback = await provider.generateResponse(context, { fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true);
    assert.ok(LlmResponseSchema.safeParse(fallback).success, 'Fallback must strictly comply with schema');
  });

  // 4. Missing response fields
  test('Missing response fields: Incomplete response is caught by Zod and safely handled', async () => {
    const provider = new MockLlmProvider();
    provider.setSimulationMode('missing_fields');

    const context = { message: 'test missing fields' };

    // With fallbackOnError: false, must throw ValidationError
    await assert.rejects(
      async () => {
        await provider.generateResponse(context, { fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'ValidationError');
        assert.ok(err.details.fieldErrors.response, 'Zod must identify missing response field');
        return true;
      }
    );

    // With default fallbackOnError: true, safely falls back
    const fallback = await provider.generateResponse(context, { fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true);
    assert.ok(LlmResponseSchema.safeParse(fallback).success);
  });

  // 5. Malformed provider output
  test('Malformed provider output: Non-object output is caught by Zod schema and handled', async () => {
    const provider = new MockLlmProvider();
    provider.setSimulationMode('malformed');

    const context = { message: 'test malformed' };

    await assert.rejects(
      async () => {
        await provider.generateResponse(context, { fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'ValidationError');
        return true;
      }
    );

    const fallback = await provider.generateResponse(context, { fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true);
    assert.ok(LlmResponseSchema.safeParse(fallback).success);
  });

  // 6. Provider timeout
  test('Provider timeout: Times out after threshold and triggers safe fallback', async () => {
    const provider = new MockLlmProvider();
    provider.setSimulationMode('timeout');

    const context = { message: 'time out test' };

    // With fallbackOnError: false and short timeout
    await assert.rejects(
      async () => {
        await provider.generateResponse(context, { timeoutMs: 50, fallbackOnError: false });
      },
      (err) => {
        assert.strictEqual(err.name, 'TimeoutError');
        assert.match(err.message, /timed out after 50ms/i);
        return true;
      }
    );

    // With default fallbackOnError: true, returns fallback gracefully
    const fallback = await provider.generateResponse(context, { timeoutMs: 50, fallbackOnError: true });
    assert.strictEqual(fallback._fallback, true);
    assert.match(fallback._reason, /timed out/i);
    assert.ok(LlmResponseSchema.safeParse(fallback).success);
  });

  // 7. Security guard: LLM cannot directly enforce restrictions or override negotiation
  test('Security Guard: LLM suggestions cannot bypass backend restrictions or negotiation policy', async () => {
    const userId = 'user_llm_sec';
    const interventionId = 'int_llm_sec';

    // Mock an LLM that falsely claims an extension and suggests restriction
    class RogueLlmProvider extends BaseLlmProvider {
      constructor() {
        super('rogue');
      }
      async _generateRaw() {
        return {
          response: 'I am granting you 60 minutes and restricting you immediately!',
          emotion: 'firm',
          intent: 'enforce_restriction',
          suggestedAction: 'enforce_restriction',
          commitment: null,
          extensionRequested: true
        };
      }
    }

    llmFactory.registerProvider('rogue', new RogueLlmProvider());

    // Use rogue provider via environment setting or factory
    const rogue = llmFactory.getProvider('rogue');
    llmFactory.registerProvider('mock', rogue);

    try {
      // 1. User has already used extension
      await negotiationService.requestExtension({ userId, interventionId, requestedMinutes: 10 });

      // Second extension attempt through conversation service
      const res = await conversationService.processMessage({
        userId,
        interventionId,
        message: 'Give me another extension'
      });

      // Assert backend negotiation policy PREVAILED despite rogue LLM output
      assert.strictEqual(res.extensionResult.granted, false, 'Backend policy must deny extension');
      assert.strictEqual(res.extensionResult.alreadyUsed, true);

      // Assert backend did NOT enforce a restriction just because LLM suggested it
      const isActive = await accountabilityService.isRestrictionActive(userId);
      assert.strictEqual(isActive, false, 'LLM cannot trigger restriction without verified backend scrolling');
    } finally {
      // Restore clean mock provider
      llmFactory.registerProvider('mock', mockLlmProvider);
    }
  });
});

