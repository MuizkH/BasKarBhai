import memoryService from './memoryService.js';

/**
 * Negotiation Service
 * Enforces scrolling extension policy:
 * - Default maximum extension allowance: 10 minutes.
 * - Maximum one extension per intervention session.
 * - Subsequent requests within the same intervention are denied.
 */

const MAX_EXTENSION_MINUTES = 10;

class NegotiationService {
  constructor() {
    // Map<interventionId, { granted: boolean, minutes: number, timestamp: string, expiresAt: string }>
    this.sessionExtensions = new Map();
  }

  /**
   * Requests a scrolling extension for a given intervention session
   */
  async requestExtension({ userId, interventionId, requestedMinutes = 10, reason = '' }) {
    if (!interventionId || typeof interventionId !== 'string' || !interventionId.trim()) {
      throw new Error('interventionId is required for extension negotiation');
    }
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required for extension negotiation');
    }

    const cleanInterventionId = interventionId.trim();
    const cleanUserId = userId.trim();

    // Check if an extension was already granted for this session
    if (this.sessionExtensions.has(cleanInterventionId)) {
      const existing = this.sessionExtensions.get(cleanInterventionId);
      const result = {
        granted: false,
        minutes: 0,
        alreadyUsed: true,
        reason: 'Extension allowance already used. Only one extension of up to 10 minutes is permitted per intervention session.',
        previousGrant: { ...existing }
      };

      // Record denied request in memory
      await memoryService.recordExtensionRequest(cleanUserId, {
        interventionId: cleanInterventionId,
        requestedMinutes: Number(requestedMinutes) || 0,
        granted: false,
        reason: result.reason
      });

      return result;
    }

    // Determine allowed minutes (capped at 10 minutes, default 10 minutes)
    const parsedMinutes = Number(requestedMinutes);
    const validMinutes = isNaN(parsedMinutes) || parsedMinutes <= 0 ? 10 : parsedMinutes;
    const grantedMinutes = Math.min(validMinutes, MAX_EXTENSION_MINUTES);

    const now = Date.now();
    const grantRecord = {
      granted: true,
      minutes: grantedMinutes,
      timestamp: new Date(now).toISOString(),
      expiresAt: new Date(now + grantedMinutes * 60 * 1000).toISOString()
    };

    // Store in active sessions map
    this.sessionExtensions.set(cleanInterventionId, grantRecord);

    const result = {
      granted: true,
      minutes: grantedMinutes,
      alreadyUsed: false,
      reason: `${grantedMinutes}-minute extension granted. Use this time intentionally.`,
      expiresAt: grantRecord.expiresAt
    };

    // Record granted extension in memory
    await memoryService.recordExtensionRequest(cleanUserId, {
      interventionId: cleanInterventionId,
      requestedMinutes: grantedMinutes,
      granted: true,
      reason: result.reason
    });

    return result;
  }

  /**
   * Checks if an intervention session currently has an active granted extension
   */
  async getExtensionStatus(interventionId) {
    if (!interventionId) return null;
    const record = this.sessionExtensions.get(interventionId.trim());
    if (!record) return null;

    const now = Date.now();
    const isExpired = now > new Date(record.expiresAt).getTime();

    return {
      ...record,
      isExpired
    };
  }

  /**
   * Clears session extension state (for testing)
   */
  clearAll() {
    this.sessionExtensions.clear();
  }
}

export const negotiationService = new NegotiationService();
export default negotiationService;

