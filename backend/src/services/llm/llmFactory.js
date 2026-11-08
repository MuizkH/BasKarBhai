import { env } from '../../config/env.js';
import { BaseLlmProvider } from './llmProvider.js';
import mockLlmProvider from './mockLlmProvider.js';
import { GeminiProvider } from './geminiProvider.js';

/**
 * Placeholder for future Temporary Hosted LLM Provider
 * Will connect to hosted endpoints when credentials and URLs are supplied.
 */
export class HostedLlmProvider extends BaseLlmProvider {
  constructor() {
    super('hosted');
  }

  async _generateRaw(context, options) {
    if (!env.HOSTED_LLM_API_KEY) {
      throw new Error("Hosted LLM API key ('HOSTED_LLM_API_KEY') is not configured");
    }

    return {
      response: 'Hosted LLM response placeholder',
      emotion: 'friendly',
      intent: 'negotiate',
      suggestedAction: 'request_commitment',
      commitment: null,
      extensionRequested: false
    };
  }
}

/**
 * Placeholder for future Gnani Evon LLM Provider
 * Will connect to Gnani Evon API when integration credentials become available.
 */
export class GnaniEvonProvider extends BaseLlmProvider {
  constructor() {
    super('evon');
  }

  async _generateRaw(context, options) {
    if (!env.EVON_API_KEY) {
      throw new Error("Gnani Evon API key ('EVON_API_KEY') is not configured");
    }

    return {
      response: 'Gnani Evon response placeholder',
      emotion: 'supportive',
      intent: 'negotiate',
      suggestedAction: 'request_commitment',
      commitment: null,
      extensionRequested: false
    };
  }
}

/**
 * LLM Factory
 * Manages provider resolution based on configuration and supports dynamic provider switching.
 * Supported providers: mock, gemini, hosted, evon.
 * Throws configuration error on unknown providers.
 */
class LlmFactory {
  constructor() {
    this.providers = new Map();
    this.providers.set('mock', mockLlmProvider);
    this.providers.set('gemini', new GeminiProvider());
    this.providers.set('hosted', new HostedLlmProvider());
    this.providers.set('evon', new GnaniEvonProvider());
  }

  /**
   * Registers or replaces a provider instance (useful for testing or plugin registration)
   */
  registerProvider(name, providerInstance) {
    if (!(providerInstance instanceof BaseLlmProvider)) {
      throw new Error('Provider must be an instance of BaseLlmProvider');
    }
    this.providers.set(name.toLowerCase(), providerInstance);
  }

  /**
   * Retrieves the configured LLM provider.
   * Throws an explicit error if provider is unsupported (does not silently fall back).
   */
  getProvider(providerType = null) {
    const selected = (providerType || env.LLM_PROVIDER || 'mock').toLowerCase();

    if (!this.providers.has(selected)) {
      throw new Error(
        `Unsupported LLM provider: '${selected}'. Supported providers are: ${Array.from(this.providers.keys()).join(', ')}`
      );
    }

    return this.providers.get(selected);
  }
}

export const llmFactory = new LlmFactory();
export default llmFactory;
