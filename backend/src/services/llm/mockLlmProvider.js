import { BaseLlmProvider } from './llmProvider.js';

/**
 * Mock LLM Provider
 * Implements context-aware conversational logic returning standard structured responses.
 * Also supports simulated failure modes for rigorous automated testing.
 */
export class MockLlmProvider extends BaseLlmProvider {
  constructor() {
    super('mock');
    this.simulationMode = null; // null | 'timeout' | 'invalid_json' | 'missing_fields' | 'malformed'
  }

  /**
   * Configure simulated failures for testing error handling and fallbacks
   */
  setSimulationMode(mode) {
    this.simulationMode = mode;
  }

  clearSimulationMode() {
    this.simulationMode = null;
  }

  /**
   * Internal generator implementing standard interface and conversational behavior
   */
  async _generateRaw(context, options) {
    // 1. Check for test simulation modes
    if (this.simulationMode === 'timeout') {
      // Delay longer than any reasonable timeout
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }

    if (this.simulationMode === 'invalid_json') {
      return '{ this is completely invalid JSON: [ }';
    }

    if (this.simulationMode === 'missing_fields') {
      // Returns JSON missing required 'response' field
      return {
        emotion: 'friendly',
        intent: 'negotiate'
        // Missing response
      };
    }

    if (this.simulationMode === 'malformed') {
      return 12345; // Invalid primitive type instead of object
    }

    // 2. Normal context-aware generation
    const {
      message = '',
      accountabilityLevel = null,
      extensionResult = null,
      commitment: contextCommitment = null,
      accountability = null,
      commitments = []
    } = context;

    const lowerMsg = (message || '').toLowerCase();
    const effectiveAccountability = accountability || accountabilityLevel;
    const hasActiveRestriction = effectiveAccountability?.restrictionActive;
    const violationCount = effectiveAccountability?.violationCount || 0;

    let responseText = '';
    let emotion = 'friendly';
    let intent = 'negotiate';
    let suggestedAction = 'request_commitment';
    let commitment = contextCommitment;
    let extensionRequested = false;

    // Check accountability restrictions first
    if (effectiveAccountability?.action === 'restriction') {
      if (effectiveAccountability.durationMinutes === 15) {
        responseText =
          "You continued scrolling after the warning. As promised, I've restricted Instagram for 15 minutes. Step away from the screen, take a deep breath, and reset.";
      } else if (effectiveAccountability.durationMinutes === 30) {
        responseText = `That is strike ${violationCount}. Instagram is now locked for 30 minutes. Doomscrolling won't solve stress or fatigue. Let's step back and do something that actually serves you.`;
      } else if (effectiveAccountability.durationMinutes === 45) {
        responseText = `This is your fourth violation. A 45-minute restriction is now in place. Step away, disconnect, and focus on what truly matters to you.`;
      } else {
        responseText = `Violation ${violationCount}: Instagram is locked for 60 minutes. Repeated doomscrolling is breaking your focus. Let's step away and take back your day.`;
      }
      emotion = 'firm';
      intent = 'enforce_restriction';
      suggestedAction = 'enforce_restriction';
    } else if (effectiveAccountability?.action === 'warning') {
      responseText =
        "Hey, you're still scrolling after our agreement. This is your official warning. If you keep scrolling, Instagram will be restricted for 15 minutes.";
      emotion = 'firm';
      intent = 'warn_user';
      suggestedAction = 'request_commitment';
    } else if (contextCommitment && contextCommitment.status === 'completed') {
      responseText = `Huge win! You followed through on "${contextCommitment.description}". That's real progress and discipline right there. Keep building this momentum!`;
      emotion = 'supportive';
      intent = 'celebrate_win';
      suggestedAction = 'none';
    } else if (contextCommitment && contextCommitment.status === 'broken') {
      responseText = `You missed your commitment to "${contextCommitment.description}". I'm not mad at you, but let's not pretend excuses will get you where you want to be. Let's reset right now.`;
      emotion = 'firm';
      intent = 'challenge_excuse';
      suggestedAction = 'request_commitment';
    } else if (extensionResult) {
      extensionRequested = true;
      if (extensionResult.granted) {
        responseText = `Alright, I gave you a ${extensionResult.minutes}-minute extension, but let's be real—this is the only one for this session. Wrap it up and get ready to switch to your goals.`;
        emotion = 'supportive';
        intent = 'negotiate';
        suggestedAction = 'request_commitment';
      } else {
        responseText =
          "No more extensions for this session. We already used your 10-minute allowance. Close the app now—you'll thank yourself later.";
        emotion = 'firm';
        intent = 'challenge_excuse';
        suggestedAction = 'encourage_focus';
      }
    } else if (contextCommitment && contextCommitment.status === 'pending') {
      responseText = `Locked in! You committed to: "${contextCommitment.description}". I'm holding you accountable to this. Close Reels now and go get it done!`;
      emotion = 'supportive';
      intent = 'acknowledge_commitment';
      suggestedAction = 'encourage_focus';
    } else if (
      lowerMsg.includes('extension') ||
      lowerMsg.includes('more minute') ||
      lowerMsg.includes('more time') ||
      lowerMsg.includes('give me five') ||
      lowerMsg.includes('give me ten')
    ) {
      extensionRequested = true;
      responseText = 'Let us negotiate your time intentionally. How many minutes do you truly need to wrap up?';
      emotion = 'friendly';
      intent = 'negotiate';
      suggestedAction = 'offer_extension';
    } else if (lowerMsg.includes('completed') || lowerMsg.includes('finished')) {
      responseText =
        "Huge win! You followed through on your commitment. That's real progress and discipline right there. Keep building this momentum!";
      emotion = 'supportive';
      intent = 'celebrate_win';
      suggestedAction = 'none';
    } else if (lowerMsg.includes('broke') || lowerMsg.includes('gave up') || lowerMsg.includes("couldn't finish")) {
      responseText =
        "You missed your commitment. I'm not mad at you, but let's not pretend excuses will get you where you want to be. Let's reset right now.";
      emotion = 'firm';
      intent = 'challenge_excuse';
      suggestedAction = 'request_commitment';
    } else if (lowerMsg.includes('commit') || lowerMsg.includes('study') || lowerMsg.includes('promise')) {
      const desc = lowerMsg.includes('java') ? 'Study Java' : 'Focus on study goals';
      commitment = { description: desc, deadline: null };
      responseText = `Locked in! You committed to: "${desc}". I'm holding you accountable to this. Close Reels now and go get it done!`;
      emotion = 'supportive';
      intent = 'acknowledge_commitment';
      suggestedAction = 'encourage_focus';
    } else {
      responseText =
        "I'm here to back you up against the scroll trap. You set limits because you have bigger goals to hit. Let's put the phone down and get back to what matters.";
      emotion = 'friendly';
      intent = 'negotiate';
      suggestedAction = 'request_commitment';
    }

    return {
      response: responseText,
      emotion,
      intent,
      suggestedAction,
      commitment,
      extensionRequested
    };
  }
}

export const mockLlmProvider = new MockLlmProvider();
export default mockLlmProvider;
