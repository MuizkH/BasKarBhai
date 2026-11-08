import { GoogleGenAI } from '@google/genai';
import { BaseLlmProvider } from './llmProvider.js';
import { env } from '../../config/env.js';
import mockLlmProvider from './mockLlmProvider.js';

/**
 * Creates a context-aware mock Gemini client for automated testing
 */
export const createGeminiMockClient = (customHandler = null) => {
  return {
    models: {
      generateContent: async ({ contents, config }) => {
        if (customHandler) {
          return customHandler({ contents, config });
        }

        const promptText = contents?.[0]?.parts?.[0]?.text || '';
        let contextData = {};
        try {
          const match = promptText.match(/Current Context:\s*(\{[\s\S]*?\})\s*User Statement:/);
          if (match && match[1]) {
            contextData = JSON.parse(match[1]);
          }
        } catch (_) {}

        const userMsgMatch = promptText.match(/User Statement:\s*"([^"]+)"/);
        const message = userMsgMatch ? userMsgMatch[1] : '';

        // Generate response using mock intelligence conforming to LlmResponseSchema
        const mockResult = await mockLlmProvider._generateRaw({
          message,
          extensionResult: contextData.backendExtensionResult,
          accountabilityLevel: contextData.accountabilityLevel,
          commitment: contextData.activeCommitments?.[0]
        });

        return {
          text: JSON.stringify(mockResult)
        };
      }
    }
  };
};

/**
 * Gemini LLM Provider
 * Integrates Google's official @google/genai SDK with structured JSON outputs,
 * robust error handling, and strict accountability boundary preservation.
 */
export class GeminiProvider extends BaseLlmProvider {
  static globalMockClient = null;

  static setGlobalMockClient(mockClient) {
    GeminiProvider.globalMockClient = mockClient;
  }

  static clearGlobalMockClient() {
    GeminiProvider.globalMockClient = null;
  }

  constructor({ apiKey = undefined, model = null, client = null } = {}) {
    super('gemini');
    this.apiKey = apiKey !== undefined ? apiKey : env.GEMINI_API_KEY;
    this.modelName = model || env.GEMINI_MODEL || 'gemini-2.5-flash';
    this.client = client;
  }

  /**
   * Lazily initializes GoogleGenAI client if not injected or mocked
   */
  _getClient() {
    if (this.client) {
      return this.client;
    }

    if (this.apiKey === null || this.apiKey === '') {
      const err = new Error(
        "Gemini API key is missing. Please set GEMINI_API_KEY in backend environment variables."
      );
      err.name = 'MissingApiKeyError';
      throw err;
    }

    if (GeminiProvider.globalMockClient) {
      return GeminiProvider.globalMockClient;
    }

    if (!this.apiKey) {
      const err = new Error(
        "Gemini API key is missing. Please set GEMINI_API_KEY in backend environment variables."
      );
      err.name = 'MissingApiKeyError';
      throw err;
    }

    this.client = new GoogleGenAI({ apiKey: this.apiKey });
    return this.client;
  }

  /**
   * Formats standardized conversation context into prompt contents
   */
  _buildPrompt(context) {
    const {
      message = '',
      history = [],
      profile = {},
      behaviouralMemory = {},
      commitments = [],
      interventionState = {},
      accountabilityLevel = {},
      extensionResult = null
    } = context;

    const systemInstruction =
      "You are an AI doomscrolling accountability companion for an Android application that helps users break out of Instagram Reels doomscrolling.\n" +
      "Personality: Honest, supportive friend who challenges excuses directly without insulting or belittling the user.\n\n" +
      "STRICT ACCOUNTABILITY RULES & BOUNDARIES:\n" +
      "1. You are a conversational agent and advisor. You CANNOT directly enforce restrictions or change violation counts.\n" +
      "2. The backend negotiation engine is authoritative. If an extension was already granted or denied, respect and reiterate that decision.\n" +
      "3. When the user asks for more time, acknowledge backend extension status.\n" +
      "4. Challenge mindless scrolling, validate underlying feelings (boredom, stress), and guide the user to their stated goals.\n" +
      "5. Always respond in valid JSON conforming to the requested schema.";

    const formattedContext = {
      currentUserMessage: message,
      recentHistory: (history || []).slice(-8).map((m) => ({
        role: m.role,
        content: m.content
      })),
      userProfile: {
        goals: profile?.goals || ['Reduce doomscrolling'],
        preferredLanguage: profile?.preferredLanguage || 'en',
        preferredPersonality: profile?.preferredPersonality || 'honest, supportive friend'
      },
      behaviouralMemory: {
        extensionStats: behaviouralMemory?.frequentlyRequestedExtensions || {},
        brokenCommitmentCount: behaviouralMemory?.commonlyBrokenCommitments?.count || 0
      },
      activeCommitments: (commitments || [])
        .filter((c) => c.status === 'pending')
        .map((c) => ({ id: c.id, description: c.description })),
      interventionState: {
        interventionId: interventionState?.interventionId || null
      },
      accountabilityLevel: {
        violationCount: accountabilityLevel?.violationCount || 0,
        restrictionActive: accountabilityLevel?.restrictionActive || false,
        warningIssued: accountabilityLevel?.warningIssued || false
      },
      backendExtensionResult: extensionResult
    };

    const userPrompt =
      `Current Context:\n${JSON.stringify(formattedContext, null, 2)}\n\n` +
      `User Statement: "${message}"\n\n` +
      `Produce your conversational response adhering strictly to the structured schema.`;

    return { systemInstruction, userPrompt };
  }

  /**
   * Core generation invoking @google/genai SDK
   */
  async _generateRaw(context, options) {
    const client = this._getClient();
    const { systemInstruction, userPrompt } = this._buildPrompt(context);

    try {
      const response = await client.models.generateContent({
        model: this.modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
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

      let textOutput = response?.text;
      if (typeof textOutput === 'function') {
        textOutput = textOutput();
      }

      if (!textOutput || typeof textOutput !== 'string') {
        const err = new Error('Empty response received from Gemini API');
        err.name = 'MalformedResponseError';
        throw err;
      }

      return textOutput;
    } catch (apiError) {
      if (apiError.status === 429 || apiError.message?.includes('RESOURCE_EXHAUSTED')) {
        apiError.name = 'RateLimitError';
      } else if (apiError.status >= 500 || apiError.message?.includes('fetch failed')) {
        apiError.name = 'NetworkError';
      }
      throw apiError;
    }
  }
}

export default GeminiProvider;
