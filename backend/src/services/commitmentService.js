import memoryService from './memoryService.js';

/**
 * Commitment Service
 * Manages user commitments with state transition integrity (pending -> completed | broken).
 * Designed for in-memory execution and forward-compatible with Supabase.
 */

class CommitmentService {
  constructor() {
    // Map<commitmentId, Commitment>
    this.commitments = new Map();
  }

  /**
   * Generates a unique ID
   */
  _generateId() {
    return `commit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Creates a new pending commitment
   */
  async createCommitment({ userId, description, deadline = null, outcomeNotes = null }) {
    if (!userId || typeof userId !== 'string' || !userId.trim()) {
      throw new Error('userId is required to create a commitment');
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      throw new Error('description is required to create a commitment');
    }

    const commitment = {
      id: this._generateId(),
      userId: userId.trim(),
      description: description.trim(),
      createdAt: new Date().toISOString(),
      deadline: deadline ? new Date(deadline).toISOString() : null,
      status: 'pending',
      completionTimestamp: null,
      outcomeNotes: outcomeNotes || null
    };

    this.commitments.set(commitment.id, commitment);

    // Record promise in episodic memory
    await memoryService.recordPromise(userId, commitment.description);

    return { ...commitment };
  }

  /**
   * Marks a commitment as completed.
   * Throws an error if commitment does not exist or has already been marked completed/broken.
   */
  async completeCommitment(commitmentId, { outcomeNotes = 'Completed successfully' } = {}) {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment) {
      throw new Error(`Commitment not found: ${commitmentId}`);
    }

    if (commitment.status !== 'pending') {
      throw new Error(
        `Commitment ${commitmentId} cannot be marked completed: status is already '${commitment.status}'`
      );
    }

    commitment.status = 'completed';
    commitment.completionTimestamp = new Date().toISOString();
    commitment.outcomeNotes = outcomeNotes;

    // Update memory engine
    await memoryService.recordCommitmentOutcome(commitment.userId, commitment, 'completed');

    return { ...commitment };
  }

  /**
   * Marks a commitment as broken.
   * Throws an error if commitment does not exist or has already been marked completed/broken.
   */
  async breakCommitment(commitmentId, { outcomeNotes = 'Commitment broken by user' } = {}) {
    const commitment = this.commitments.get(commitmentId);
    if (!commitment) {
      throw new Error(`Commitment not found: ${commitmentId}`);
    }

    if (commitment.status !== 'pending') {
      throw new Error(
        `Commitment ${commitmentId} cannot be marked broken: status is already '${commitment.status}'`
      );
    }

    commitment.status = 'broken';
    commitment.completionTimestamp = new Date().toISOString();
    commitment.outcomeNotes = outcomeNotes;

    // Update memory engine
    await memoryService.recordCommitmentOutcome(commitment.userId, commitment, 'broken');

    return { ...commitment };
  }

  /**
   * Retrieves commitments for a user, optionally filtered by status
   */
  async getCommitments(userId, { status = null } = {}) {
    if (!userId) {
      throw new Error('userId is required to retrieve commitments');
    }

    const userCommitments = Array.from(this.commitments.values()).filter(
      (c) => c.userId === userId
    );

    if (status) {
      return userCommitments.filter((c) => c.status === status).map((c) => ({ ...c }));
    }

    return userCommitments.map((c) => ({ ...c }));
  }

  /**
   * Retrieves a single commitment by ID
   */
  async getCommitmentById(commitmentId) {
    const commitment = this.commitments.get(commitmentId);
    return commitment ? { ...commitment } : null;
  }

  /**
   * Clears all commitments (for testing)
   */
  clearAll() {
    this.commitments.clear();
  }
}

export const commitmentService = new CommitmentService();
export default commitmentService;

