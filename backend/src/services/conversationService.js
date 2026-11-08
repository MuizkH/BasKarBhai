import memoryService from './memoryService.js';
import commitmentService from './commitmentService.js';
import negotiationService from './negotiationService.js';
import accountabilityService from './accountabilityService.js';
import llmFactory from './llm/llmFactory.js';

/**
 * Conversation Service
 * Orchestrates conversation sessions, memory retrieval, negotiation,
 * commitments, accountability checks, and response generation.
 */

class ConversationService {
  constructor() {
    // Map<interventionId, { userId, messages: [{ role, content, timestamp }], createdAt, updatedAt }>
    this.sessions = new Map();
  }

  /**
   * Helper to retrieve or create a conversation session
   */
  _getOrCreateSession(interventionId, userId) {
    if (!this.sessions.has(interventionId)) {
      this.sessions.set(interventionId, {
        interventionId,
        userId,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    return this.sessions.get(interventionId);
  }

  /**
   * Parses natural language message to extract requested extension minutes if present
   */
  _extractExtensionMinutes(message) {
    const lower = message.toLowerCase();
    const match = lower.match(/(\d+)\s*(-|\s)?(minute|min)/);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
    if (lower.includes('five')) return 5;
    if (lower.includes('ten')) return 10;
    return 10; // Default policy allowance
  }

  /**
   * Checks if a message indicates an extension request
   */
  _isExtensionRequest(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('extension') ||
      lower.includes('more minute') ||
      lower.includes('more time') ||
      lower.includes('five more minutes') ||
      lower.includes('give me five') ||
      lower.includes('give me ten') ||
      lower.includes('extra time') ||
      lower.includes('10 more')
    );
  }

  /**
   * Checks if message is creating a commitment
   */
  _isCommitmentCreation(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('i commit') ||
      lower.includes('i will study') ||
      lower.includes('i promise') ||
      lower.includes('commitment to') ||
      lower.includes('will study java') ||
      lower.includes('promise to study') ||
      lower.includes('commit to study')
    );
  }

  /**
   * Extracts commitment description
   */
  _extractCommitmentDescription(message) {
    const lower = message.toLowerCase();
    if (lower.includes('java')) {
      return 'Study Java';
    }
    const match = message.match(/(?:commit to|promise to|i will)\s+(.+)/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return message.trim();
  }

  /**
   * Checks if message indicates commitment completion
   */
  _isCommitmentCompletion(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('completed my commitment') ||
      lower.includes('finished studying') ||
      lower.includes('completed the commitment') ||
      lower.includes('completed studying') ||
      lower.includes('finished java') ||
      lower.includes('done studying') ||
      lower.includes('i did it')
    );
  }

  /**
   * Checks if message indicates a broken commitment
   */
  _isCommitmentBroken(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('broke my commitment') ||
      lower.includes('failed to study') ||
      lower.includes('gave up') ||
      lower.includes('could not finish') ||
      lower.includes("couldn't finish") ||
      lower.includes('didn’t study') ||
      lower.includes("didn't study")
    );
  }

  /**
   * Main conversational entry point
   */
  async processMessage({ userId, interventionId, message, event = null }) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required');
    }
    if (!interventionId || typeof interventionId !== 'string' || !interventionId.trim()) {
      throw new Error('interventionId is required');
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new Error('message is required and must not be empty');
    }

    const cleanUserId = userId.trim();
    const cleanInterventionId = interventionId.trim();
    const cleanMessage = message.trim();

    const session = this._getOrCreateSession(cleanInterventionId, cleanUserId);
    const nowIso = new Date().toISOString();

    // Add user turn to session history
    session.messages.push({
      role: 'user',
      content: cleanMessage,
      timestamp: nowIso
    });

    let extensionResult = null;
    let commitment = null;
    let accountability = null;

    // 1. Check for extension negotiation
    if (event?.type === 'extension_request' || this._isExtensionRequest(cleanMessage)) {
      const minutes = event?.minutes || this._extractExtensionMinutes(cleanMessage);
      extensionResult = await negotiationService.requestExtension({
        userId: cleanUserId,
        interventionId: cleanInterventionId,
        requestedMinutes: minutes,
        reason: cleanMessage
      });
    }

    // 2. Check for commitment creation
    if (event?.type === 'create_commitment' || this._isCommitmentCreation(cleanMessage)) {
      const desc = event?.description || this._extractCommitmentDescription(cleanMessage);
      commitment = await commitmentService.createCommitment({
        userId: cleanUserId,
        description: desc,
        deadline: event?.deadline || null
      });
    }

    // 3. Check for commitment completion
    if (event?.type === 'complete_commitment' || this._isCommitmentCompletion(cleanMessage)) {
      const pendingList = await commitmentService.getCommitments(cleanUserId, { status: 'pending' });
      if (pendingList.length > 0) {
        const target = pendingList[pendingList.length - 1];
        commitment = await commitmentService.completeCommitment(target.id, {
          outcomeNotes: 'Completed successfully via voice intervention'
        });
      }
    }

    // 4. Check for broken commitment
    if (event?.type === 'break_commitment' || this._isCommitmentBroken(cleanMessage)) {
      const pendingList = await commitmentService.getCommitments(cleanUserId, { status: 'pending' });
      if (pendingList.length > 0) {
        const target = pendingList[pendingList.length - 1];
        commitment = await commitmentService.breakCommitment(target.id, {
          outcomeNotes: 'User reported broken commitment'
        });
      }

      // Scenario 10: If scrolling is NOT verified, do not trigger a restriction!
      if (event?.verifiedScrolling === true) {
        accountability = await accountabilityService.handleScrollViolation(cleanUserId, {
          interventionId: cleanInterventionId,
          eventId: event?.eventId || null,
          verifiedScrolling: true,
          reason: 'User broke commitment and continued scrolling',
          isTrusted: event?.isTrusted !== false
        });
      }
    }

    // 5. Check for scrolling violation event (e.g. Scenarios 6, 7, 8, 10)
    if (event?.type === 'scrolling_violation' || event?.type === 'continued_scrolling') {
      accountability = await accountabilityService.handleScrollViolation(cleanUserId, {
        interventionId: cleanInterventionId,
        eventId: event.eventId || null,
        verifiedScrolling: event.verifiedScrolling === true,
        reason: event.reason || 'Detected continued scrolling',
        isTrusted: event.isTrusted !== false
      });
    }

    // Retrieve full context for the LLM provider (Task 2 Standard Interface)
    const relevantMemory = await memoryService.getRelevantContext(cleanUserId);
    const userProfile = await memoryService.getUserProfile(cleanUserId);
    const behaviouralMemory = await memoryService.getBehaviouralSummary(cleanUserId);
    const activeCommitments = await commitmentService.getCommitments(cleanUserId, { status: 'pending' });
    const allCommitments = await commitmentService.getCommitments(cleanUserId);
    const userAccountabilityState = await accountabilityService.getUserAccountability(cleanUserId);

    const llmContext = {
      message: cleanMessage,
      history: [...session.messages],
      profile: userProfile,
      behaviouralMemory,
      commitments: allCommitments,
      interventionState: {
        interventionId: cleanInterventionId,
        createdAt: session.createdAt,
        messageCount: session.messages.length
      },
      accountabilityLevel: userAccountabilityState,
      extensionResult,
      commitment,
      accountability
    };

    // Generate response using configured LLM Provider with timeout and Zod validation
    const llmProvider = llmFactory.getProvider();
    const llmOutput = await llmProvider.generateResponse(llmContext);
    const responseText = llmOutput.response;

    // Record AI assistant turn in session
    session.messages.push({
      role: 'assistant',
      content: responseText,
      timestamp: new Date().toISOString()
    });
    session.updatedAt = new Date().toISOString();

    // Persist conversation into episodic memory
    await memoryService.recordConversation(cleanUserId, cleanInterventionId, session.messages);

    return {
      response: responseText,
      llmDetails: {
        emotion: llmOutput.emotion,
        intent: llmOutput.intent,
        suggestedAction: llmOutput.suggestedAction,
        extensionRequested: llmOutput.extensionRequested
      },
      memory: {
        goals: relevantMemory.goals,
        activeCommitments: activeCommitments.map((c) => ({
          id: c.id,
          description: c.description,
          status: c.status
        })),
        recentCompletedCount: relevantMemory.totalCompletedCommitments,
        recentBrokenCount: relevantMemory.totalBrokenCommitments
      },
      extensionResult,
      commitment,
      accountability
    };
  }

  /**
   * Retrieves conversation session messages
   */
  async getSession(interventionId) {
    if (!interventionId) return null;
    const session = this.sessions.get(interventionId.trim());
    return session ? { ...session, messages: [...session.messages] } : null;
  }

  /**
   * Clears in-memory sessions (for test isolation)
   */
  clearAll() {
    this.sessions.clear();
  }
}

export const conversationService = new ConversationService();
export default conversationService;

