/**
 * Accountability Service
 * Enforces progressive restrictions based on verified scrolling violations:
 * - Violation 1: Warning only.
 * - Violation 2: 15-minute restriction.
 * - Violation 3: 30-minute restriction.
 * - Violation 4: 45-minute restriction.
 * - Violation 5+: 60-minute restriction.
 * 
 * Rules:
 * - Stacking Guard: Cannot stack multiple restrictions while an active restriction is in effect.
 * - Idempotency Guard: Duplicate event IDs cannot generate duplicate violations.
 * - Verification Guard: Only trusted backend verification can trigger restrictions.
 * - Scenario 10 Guard: Missed commitments without verified continued scrolling NEVER trigger a restriction.
 * - Expiry: Expired restrictions automatically deactivate.
 */

class AccountabilityService {
  constructor() {
    // Map<userId, UserAccountabilityState>
    this.userAccountability = new Map();
  }

  _getOrCreateUserState(userId) {
    if (!this.userAccountability.has(userId)) {
      this.userAccountability.set(userId, {
        violationCount: 0,
        warningIssued: false,
        currentRestriction: null,
        history: [],
        processedEvents: new Map() // eventId -> result (for idempotency)
      });
    }
    return this.userAccountability.get(userId);
  }

  /**
   * Calculates restriction duration based on violation count:
   * Violation 1: 0 (warning)
   * Violation 2: 15 min
   * Violation 3: 30 min
   * Violation 4: 45 min
   * Violation 5+: 60 min
   */
  _getRestrictionDuration(violationNumber) {
    if (violationNumber <= 1) return 0;
    if (violationNumber === 2) return 15;
    if (violationNumber === 3) return 30;
    if (violationNumber === 4) return 45;
    return 60; // 5 and subsequent
  }

  /**
   * Helper to check and expire restriction if time has elapsed
   */
  _checkActiveRestriction(state) {
    if (!state.currentRestriction) return false;

    const now = Date.now();
    const expiryTime = new Date(state.currentRestriction.expiresAt).getTime();

    if (now >= expiryTime) {
      state.currentRestriction.status = 'expired';
      return false;
    }

    return state.currentRestriction.status === 'active';
  }

  /**
   * Evaluates scrolling behavior and applies progressive accountability.
   */
  async handleScrollViolation(
    userId,
    {
      interventionId = null,
      eventId = null,
      verifiedScrolling = false,
      reason = 'Continued scrolling',
      isTrusted = true
    } = {}
  ) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required for accountability tracking');
    }

    const cleanUserId = userId.trim();
    const state = this._getOrCreateUserState(cleanUserId);

    // 1. Idempotency Check: prevent duplicate enforcement requests
    if (eventId && state.processedEvents.has(eventId)) {
      const existing = state.processedEvents.get(eventId);
      return {
        ...existing,
        isDuplicate: true
      };
    }

    // 2. Security Check: Only trusted verification can trigger enforcement
    if (!isTrusted) {
      return {
        success: false,
        action: 'unauthorized',
        restrictionActive: this._checkActiveRestriction(state),
        currentRestriction: state.currentRestriction,
        violationCount: state.violationCount,
        reason: 'Untrusted enforcement request. Verified scrolling claims must be cryptographically verified.'
      };
    }

    // 3. Scenario 10 check: Missed commitments or unverified events must NOT trigger a restriction
    if (!verifiedScrolling) {
      const result = {
        success: true,
        action: 'none',
        restrictionActive: this._checkActiveRestriction(state),
        currentRestriction: state.currentRestriction,
        violationCount: state.violationCount,
        reason: 'No verified continued scrolling. No restriction or violation triggered.'
      };
      if (eventId) state.processedEvents.set(eventId, result);
      return result;
    }

    // 4. Stacking Guard: Do not allow multiple restrictions to stack while an existing restriction is active
    if (this._checkActiveRestriction(state)) {
      const result = {
        success: false,
        action: 'already_restricted',
        restrictionActive: true,
        currentRestriction: { ...state.currentRestriction },
        violationCount: state.violationCount,
        reason: 'Active restriction already in effect. Restrictions cannot be stacked.'
      };
      if (eventId) state.processedEvents.set(eventId, result);
      return result;
    }

    // 5. Escalate violation count
    state.violationCount += 1;
    const now = Date.now();
    const violationNum = state.violationCount;

    if (violationNum === 1) {
      // First violation: Warning only
      state.warningIssued = true;
      const violationRecord = {
        violationNumber: 1,
        action: 'warning',
        timestamp: new Date(now).toISOString(),
        interventionId,
        eventId,
        reason
      };
      state.history.push(violationRecord);

      const result = {
        success: true,
        action: 'warning',
        restrictionActive: false,
        currentRestriction: null,
        violationCount: 1,
        durationMinutes: 0,
        message: 'Warning: Continued scrolling detected. Next violation will enforce a 15-minute restriction.'
      };

      if (eventId) state.processedEvents.set(eventId, result);
      return result;
    }

    // Violations 2+: Escalating restrictions (15m, 30m, 45m, 60m)
    const durationMinutes = this._getRestrictionDuration(violationNum);
    const expiresAt = new Date(now + durationMinutes * 60 * 1000).toISOString();

    state.currentRestriction = {
      durationMinutes,
      startedAt: new Date(now).toISOString(),
      expiresAt,
      status: 'active',
      violationNumber: violationNum
    };

    state.history.push({
      violationNumber: violationNum,
      action: `restriction_${durationMinutes}_min`,
      timestamp: new Date(now).toISOString(),
      expiresAt,
      interventionId,
      eventId,
      reason
    });

    const result = {
      success: true,
      action: 'restriction',
      restrictionActive: true,
      currentRestriction: { ...state.currentRestriction },
      violationCount: violationNum,
      durationMinutes,
      message: `Violation ${violationNum}: ${durationMinutes}-minute restriction enforced.`
    };

    if (eventId) state.processedEvents.set(eventId, result);
    return result;
  }

  /**
   * Checks whether a user currently has an active restriction.
   */
  async isRestrictionActive(userId) {
    if (!userId) return false;
    const state = this.userAccountability.get(userId);
    if (!state) return false;

    return this._checkActiveRestriction(state);
  }

  /**
   * Returns current accountability state for a user.
   */
  async getUserAccountability(userId) {
    if (!userId) return null;
    const state = this._getOrCreateUserState(userId);
    const active = this._checkActiveRestriction(state);

    return {
      violationCount: state.violationCount,
      warningIssued: state.warningIssued,
      restrictionActive: active,
      currentRestriction: state.currentRestriction ? { ...state.currentRestriction } : null,
      historyCount: state.history.length,
      history: [...state.history]
    };
  }

  /**
   * Explicitly sets a restriction expiry date (for testing or administrative override)
   */
  async overrideRestrictionExpiry(userId, newExpiryDate) {
    const state = this._getOrCreateUserState(userId);
    if (state.currentRestriction) {
      state.currentRestriction.expiresAt = new Date(newExpiryDate).toISOString();
    }
  }

  /**
   * Clears all state (for tests)
   */
  clearAll() {
    this.userAccountability.clear();
  }

  clearUser(userId) {
    this.userAccountability.delete(userId);
  }
}

export const accountabilityService = new AccountabilityService();
export default accountabilityService;
