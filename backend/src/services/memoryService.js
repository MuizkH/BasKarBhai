/**
 * Memory Service
 * Manages User Profile Memory, Episodic Memory, and Behavioural Memory.
 * Designed with async methods so Supabase can replace the in-memory store seamlessly.
 */

class MemoryService {
  constructor() {
    // Stores memory keyed by userId: Map<string, { profile, episodic, behavioural }>
    this.storage = new Map();
  }

  /**
   * Initializes or gets existing user memory store
   */
  _getOrCreateUserMemory(userId) {
    if (!this.storage.has(userId)) {
      this.storage.set(userId, {
        profile: {
          goals: ['Reduce Instagram Reels consumption', 'Study and build projects'],
          preferredLanguage: 'en',
          dailyReelLimitMinutes: 30,
          preferredPersonality: 'honest, supportive friend who challenges excuses without insulting',
          interventionStyle: 'direct_challenge'
        },
        episodic: {
          conversations: [], // [{ interventionId, timestamp, messages: [{ role, content, timestamp }] }]
          promisesMade: [], // [{ id, text, createdAt }]
          completedCommitments: [], // [{ commitmentId, description, completedAt }]
          brokenCommitments: [], // [{ commitmentId, description, brokenAt }]
          extensionRequests: [] // [{ interventionId, requestedMinutes, granted, timestamp, reason }]
        },
        behavioural: {
          frequentlyRequestedExtensions: {
            totalRequests: 0,
            grantedCount: 0,
            deniedCount: 0,
            averageRequestedMinutes: 0
          },
          commonlyBrokenCommitments: {
            count: 0,
            topics: []
          },
          successfulCommitmentPatterns: {
            count: 0,
            topics: []
          },
          scrollingReasons: {} // reason -> count
        }
      });
    }
    return this.storage.get(userId);
  }

  /**
   * Category A: User Profile Memory
   */
  async getUserProfile(userId) {
    const memory = this._getOrCreateUserMemory(userId);
    return { ...memory.profile };
  }

  async updateUserProfile(userId, profileUpdates = {}) {
    const memory = this._getOrCreateUserMemory(userId);
    memory.profile = {
      ...memory.profile,
      ...profileUpdates
    };
    return { ...memory.profile };
  }

  /**
   * Category B: Episodic Memory
   */
  async recordConversation(userId, interventionId, messages = []) {
    const memory = this._getOrCreateUserMemory(userId);
    const sessionRecord = {
      interventionId,
      timestamp: new Date().toISOString(),
      messages: [...messages]
    };

    memory.episodic.conversations.push(sessionRecord);
    return sessionRecord;
  }

  async recordPromise(userId, promiseText) {
    const memory = this._getOrCreateUserMemory(userId);
    const promise = {
      id: `promise_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      text: promiseText,
      createdAt: new Date().toISOString()
    };
    memory.episodic.promisesMade.push(promise);
    return promise;
  }

  async recordExtensionRequest(userId, { interventionId, requestedMinutes, granted, reason = '' }) {
    const memory = this._getOrCreateUserMemory(userId);
    const record = {
      interventionId,
      requestedMinutes,
      granted,
      reason,
      timestamp: new Date().toISOString()
    };

    memory.episodic.extensionRequests.push(record);

    // Update behavioural metrics
    const extStats = memory.behavioural.frequentlyRequestedExtensions;
    const prevTotal = extStats.totalRequests;
    extStats.totalRequests += 1;
    if (granted) {
      extStats.grantedCount += 1;
    } else {
      extStats.deniedCount += 1;
    }
    extStats.averageRequestedMinutes =
      (extStats.averageRequestedMinutes * prevTotal + requestedMinutes) / extStats.totalRequests;

    return record;
  }

  async recordCommitmentOutcome(userId, commitment, outcome) {
    const memory = this._getOrCreateUserMemory(userId);
    const timestamp = new Date().toISOString();

    if (outcome === 'completed') {
      memory.episodic.completedCommitments.push({
        commitmentId: commitment.id,
        description: commitment.description,
        completedAt: timestamp
      });

      // Update behavioural metrics
      memory.behavioural.successfulCommitmentPatterns.count += 1;
      memory.behavioural.successfulCommitmentPatterns.topics.push(commitment.description);
    } else if (outcome === 'broken') {
      memory.episodic.brokenCommitments.push({
        commitmentId: commitment.id,
        description: commitment.description,
        brokenAt: timestamp
      });

      // Update behavioural metrics
      memory.behavioural.commonlyBrokenCommitments.count += 1;
      memory.behavioural.commonlyBrokenCommitments.topics.push(commitment.description);
    }
  }

  async recordScrollReason(userId, reason) {
    const memory = this._getOrCreateUserMemory(userId);
    if (!reason) return;
    const normalized = reason.trim().toLowerCase();
    memory.behavioural.scrollingReasons[normalized] =
      (memory.behavioural.scrollingReasons[normalized] || 0) + 1;
  }

  /**
   * Category C: Behavioural Memory retrieval
   */
  async getBehaviouralSummary(userId) {
    const memory = this._getOrCreateUserMemory(userId);
    return { ...memory.behavioural };
  }

  /**
   * Full memory retrieval for the Conversation Engine
   */
  async getUserMemory(userId) {
    const memory = this._getOrCreateUserMemory(userId);
    return {
      profile: { ...memory.profile },
      episodic: {
        conversations: [...memory.episodic.conversations],
        promisesMade: [...memory.episodic.promisesMade],
        completedCommitments: [...memory.episodic.completedCommitments],
        brokenCommitments: [...memory.episodic.brokenCommitments],
        extensionRequests: [...memory.episodic.extensionRequests]
      },
      behavioural: { ...memory.behavioural }
    };
  }

  /**
   * Retrieves clean, high-priority historical context for current intervention
   */
  async getRelevantContext(userId) {
    const memory = this._getOrCreateUserMemory(userId);
    const recentBroken = memory.episodic.brokenCommitments.slice(-3);
    const recentCompleted = memory.episodic.completedCommitments.slice(-3);
    const recentExtensions = memory.episodic.extensionRequests.slice(-3);

    return {
      goals: memory.profile.goals,
      personality: memory.profile.preferredPersonality,
      totalCompletedCommitments: memory.episodic.completedCommitments.length,
      totalBrokenCommitments: memory.episodic.brokenCommitments.length,
      recentBrokenCommitments: recentBroken.map((c) => c.description),
      recentCompletedCommitments: recentCompleted.map((c) => c.description),
      hasPastBrokenCommitments: memory.episodic.brokenCommitments.length > 0,
      totalExtensionRequests: memory.behavioural.frequentlyRequestedExtensions.totalRequests,
      recentExtensions
    };
  }

  /**
   * Clears memory for isolated testing
   */
  clearAll() {
    this.storage.clear();
  }

  clearUserMemory(userId) {
    this.storage.delete(userId);
  }
}

export const memoryService = new MemoryService();
export default memoryService;

