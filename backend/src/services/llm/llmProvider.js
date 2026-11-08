import { z } from 'zod';
import { env } from '../../config/env.js';

/**
 * Standard LLM Response Schema (Zod)
 */
export const LlmResponseSchema = z.object({
  response: z.string().min(1, 'response string cannot be empty'),
  emotion: z.string().default('friendly'),
  intent: z.string().default('negotiate'),
  suggestedAction: z.string().default('request_commitment'),
  commitment: z
    .object({
      description: z.string(),
      deadline: z.string().optional().nullable()
    })
    .optional()
    .nullable()
    .default(null),
  extensionRequested: z.boolean().default(false),
  _fallback: z.boolean().optional(),
  _provider: z.string().optional(),
  _reason: z.string().optional()
});

/**
 * Base Abstract LLM Provider
 * Implements standard interface, timeout protection, Zod schema validation,
 * and reliable fallback handling.
 */
export class BaseLlmProvider {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Generates a safe fallback response compliant with LlmResponseSchema
   */
  createFallbackResponse(context = {}, reason = 'Fallback triggered') {
    const defaultResponse =
      "I'm here to back you up against the scroll trap. You set limits because you have bigger goals to hit. Let's put the phone down and get back to what matters.";

    return {
      response: defaultResponse,
      emotion: 'supportive',
      intent: 'challenge_excuse',
      suggestedAction: 'request_commitment',
      commitment: null,
      extensionRequested: false,
      _fallback: true,
      _provider: this.name,
      _reason: reason
    };
  }

  /**
   * Internal generation logic to be implemented by concrete providers
   */
  async _generateRaw(context, options) {
    throw new Error(`_generateRaw not implemented in ${this.name}`);
  }

  /**
   * Standard public generation method with timeout and validation
   * @param {Object} context Context containing message, history, profile, behaviouralMemory, commitments, interventionState, accountabilityLevel
   * @param {Object} options Options such as timeoutMs, fallbackOnError
   */
  async generateResponse(context, options = {}) {
    const timeoutMs = options.timeoutMs ?? env.LLM_TIMEOUT_MS ?? 5000;
    const fallbackOnError = options.fallbackOnError ?? true;

    try {
      // 1. Enforce timeout using Promise.race
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error(`LLM provider '${this.name}' timed out after ${timeoutMs}ms`);
          timeoutErr.name = 'TimeoutError';
          reject(timeoutErr);
        }, timeoutMs);
      });

      const rawResult = await Promise.race([
        this._generateRaw(context, options),
        timeoutPromise
      ]).finally(() => {
        if (timer) clearTimeout(timer);
      });

      // 2. Parse raw result if string
      let parsed = rawResult;
      if (typeof rawResult === 'string') {
        try {
          parsed = JSON.parse(rawResult);
        } catch (jsonErr) {
          const malformedErr = new Error(`Malformed JSON output from LLM provider '${this.name}': ${jsonErr.message}`);
          malformedErr.name = 'MalformedJsonError';
          throw malformedErr;
        }
      }

      // 3. Validate against standard Zod response schema
      const validation = LlmResponseSchema.safeParse(parsed);
      if (!validation.success) {
        const validationErr = new Error(
          `Invalid response schema from LLM provider '${this.name}': ${JSON.stringify(validation.error.flatten().fieldErrors)}`
        );
        validationErr.name = 'ValidationError';
        validationErr.details = validation.error.flatten();
        throw validationErr;
      }

      return validation.data;
    } catch (error) {
      if (!fallbackOnError) {
        throw error;
      }
      return this.createFallbackResponse(context, error.message);
    }
  }
}

export default BaseLlmProvider;

