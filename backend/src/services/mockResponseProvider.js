import llmFactory from './llm/llmFactory.js';

/**
 * Mock Response Provider (Compatibility Wrapper)
 * Delegates to the configured LLM provider architecture via LlmFactory,
 * ensuring backward compatibility with earlier conversation engine integrations.
 */
class MockResponseProvider {
  async generateResponse({
    message = '',
    extensionResult = null,
    commitment = null,
    accountability = null,
    context = {}
  }) {
    const provider = llmFactory.getProvider();

    const llmContext = {
      message,
      extensionResult,
      commitment,
      accountabilityLevel: accountability,
      profile: context.profile || {},
      behaviouralMemory: context.behaviouralMemory || {},
      commitments: context.activeCommitments || [],
      history: context.history || [],
      interventionState: context.interventionState || {}
    };

    const result = await provider.generateResponse(llmContext);
    return result.response;
  }
}

export const mockResponseProvider = new MockResponseProvider();
export default mockResponseProvider;
