import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { GoogleGenAI } from '@google/genai';
import { LlmResponseSchema } from '../src/services/llm/llmProvider.js';

// Load environment variables from backend/.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

async function runSmokeTest() {
  const apiKey = process.env.GEMINI_API_KEY;
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  console.log('====================================================');
  console.log('       GEMINI LIVE API SMOKE TEST (REAL CALL)       ');
  console.log('====================================================');
  console.log(`Configured Model Name: ${modelName}`);

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    console.log('API Request Succeeded: false (No GEMINI_API_KEY found in .env)');
    console.log('Schema Validation Passed: false');
    console.log('Generated Conversational Response: N/A');
    console.error('[Error] GEMINI_API_KEY is not set in backend/.env');
    process.exit(1);
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const systemInstruction =
      'You are an AI doomscrolling accountability companion for an Android application that helps users break out of Instagram Reels doomscrolling.\n' +
      'Personality: Honest, supportive friend who challenges excuses directly without insulting or belittling the user.\n' +
      'Return the response strictly using the provided JSON schema.';

    const promptText =
      'A user says they have been scrolling Instagram for 45 minutes despite planning to study Java. ' +
      'Respond as a supportive but direct accountability friend. Return the response using our existing LlmResponseSchema.';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [{ text: promptText }]
        }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            response: {
              type: 'STRING',
              description: 'Natural conversational response to the user'
            },
            emotion: {
              type: 'STRING',
              description: 'Conversational emotion: friendly, firm, supportive, empathetic, neutral'
            },
            intent: {
              type: 'STRING',
              description: 'Primary intent: negotiate, challenge_excuse, acknowledge_commitment, celebrate_win, warn_user, enforce_restriction, general_chat'
            },
            suggestedAction: {
              type: 'STRING',
              description: 'Suggested next step: request_commitment, offer_extension, encourage_focus, none'
            },
            commitment: {
              type: 'OBJECT',
              properties: {
                description: { type: 'STRING' },
                deadline: { type: 'STRING', nullable: true }
              },
              nullable: true
            },
            extensionRequested: {
              type: 'BOOLEAN',
              description: 'Whether user is asking for more scrolling time'
            }
          },
          required: ['response', 'emotion', 'intent', 'suggestedAction', 'extensionRequested']
        }
      }
    });

    let rawOutput = response?.text;
    if (typeof rawOutput === 'function') {
      rawOutput = rawOutput();
    }

    if (!rawOutput) {
      throw new Error('Received empty text from Gemini API response');
    }

    const apiRequestSucceeded = true;
    console.log(`API Request Succeeded: ${apiRequestSucceeded}`);

    // Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(rawOutput);
    } catch (jsonErr) {
      console.log('Schema Validation Passed: false (Malformed JSON)');
      console.log(`Raw output: ${rawOutput}`);
      throw jsonErr;
    }

    // Validate with Zod schema
    const validation = LlmResponseSchema.safeParse(parsed);
    const schemaValidationPassed = validation.success;
    console.log(`Schema Validation Passed: ${schemaValidationPassed}`);

    if (!validation.success) {
      console.error('Schema Errors:', validation.error.flatten().fieldErrors);
      console.log('Raw output:', parsed);
    } else {
      console.log('\n--- Model Response Details ---');
      console.log(`Emotion: ${validation.data.emotion}`);
      console.log(`Intent: ${validation.data.intent}`);
      console.log(`Suggested Action: ${validation.data.suggestedAction}`);
      console.log('\n--- Generated Conversational Response ---');
      console.log(validation.data.response);
      console.log('------------------------------------------');
    }
    console.log('====================================================\n');
  } catch (error) {
    console.log('API Request Succeeded: false');
    console.log('Schema Validation Passed: false');
    console.log('Generated Conversational Response: N/A');

    // Clean error message that never leaks the API key
    let safeMessage = error.message || 'Unknown error occurred during Gemini API call';
    if (apiKey) {
      safeMessage = safeMessage.replaceAll(apiKey, '[REDACTED_API_KEY]');
    }
    console.error(`\n[API Error Details]: ${safeMessage}`);
    if (error.status) {
      console.error(`[HTTP Status]: ${error.status}`);
    }
    console.log('====================================================\n');
    process.exit(1);
  }
}

runSmokeTest();

