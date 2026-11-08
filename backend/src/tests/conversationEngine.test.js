import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import memoryService from '../services/memoryService.js';
import commitmentService from '../services/commitmentService.js';
import negotiationService from '../services/negotiationService.js';
import accountabilityService from '../services/accountabilityService.js';
import conversationService from '../services/conversationService.js';
import { GeminiProvider, createGeminiMockClient } from '../services/llm/geminiProvider.js';
import app from '../app.js';

describe('Conversation Engine & Accountability V1 Audit Suite', () => {
  beforeEach(() => {
    // Clean all state between test runs and configure mock Gemini client
    GeminiProvider.setGlobalMockClient(createGeminiMockClient());
    memoryService.clearAll();
    commitmentService.clearAll();
    negotiationService.clearAll();
    accountabilityService.clearAll();
    conversationService.clearAll();
  });

  // Scenario 1: User requests a 10-minute extension
  test('Scenario 1: User requests a 10-minute extension', async () => {
    const userId = 'user_s1';
    const interventionId = 'intervention_s1';

    const result = await conversationService.processMessage({
      userId,
      interventionId,
      message: 'Can I get a 10-minute extension to finish this video?'
    });

    assert.ok(result.extensionResult, 'Extension result should be present');
    assert.strictEqual(result.extensionResult.granted, true);
    assert.strictEqual(result.extensionResult.minutes, 10);
    assert.strictEqual(result.extensionResult.alreadyUsed, false);
    assert.match(result.response, /10-minute extension/i);

    // Verify episodic memory stored extension
    const userMemory = await memoryService.getUserMemory(userId);
    assert.strictEqual(userMemory.episodic.extensionRequests.length, 1);
    assert.strictEqual(userMemory.episodic.extensionRequests[0].granted, true);
    assert.strictEqual(userMemory.episodic.extensionRequests[0].requestedMinutes, 10);
  });

  // Scenario 2: User requests another extension after using the permitted extension
  test('Scenario 2: User requests another extension after using permitted extension', async () => {
    const userId = 'user_s2';
    const interventionId = 'intervention_s2';

    // First extension request: granted
    const firstResult = await conversationService.processMessage({
      userId,
      interventionId,
      message: 'Give me ten more minutes'
    });
    assert.strictEqual(firstResult.extensionResult.granted, true);

    // Second extension request in the same intervention session: denied
    const secondResult = await conversationService.processMessage({
      userId,
      interventionId,
      message: 'Can I please have 5 more minutes?'
    });

    assert.ok(secondResult.extensionResult, 'Extension result should be present');
    assert.strictEqual(secondResult.extensionResult.granted, false);
    assert.strictEqual(secondResult.extensionResult.minutes, 0);
    assert.strictEqual(secondResult.extensionResult.alreadyUsed, true);
    assert.match(secondResult.response, /no more extensions/i);

    // Verify behavioural memory updated denied count
    const behavioural = await memoryService.getBehaviouralSummary(userId);
    assert.strictEqual(behavioural.frequentlyRequestedExtensions.grantedCount, 1);
    assert.strictEqual(behavioural.frequentlyRequestedExtensions.deniedCount, 1);
  });

  // Scenario 3: User makes a commitment to study Java
  test('Scenario 3: User makes a commitment to study Java', async () => {
    const userId = 'user_s3';
    const interventionId = 'intervention_s3';

    const result = await conversationService.processMessage({
      userId,
      interventionId,
      message: 'I will study Java right now instead of scrolling'
    });

    assert.ok(result.commitment, 'Commitment should be created');
    assert.strictEqual(result.commitment.userId, userId);
    assert.strictEqual(result.commitment.description, 'Study Java');
    assert.strictEqual(result.commitment.status, 'pending');
    assert.strictEqual(result.commitment.completionTimestamp, null);
    assert.match(result.response, /Study Java/i);

    // Verify commitment stored in service
    const pendingList = await commitmentService.getCommitments(userId, { status: 'pending' });
    assert.strictEqual(pendingList.length, 1);
    assert.strictEqual(pendingList[0].description, 'Study Java');
  });

  // Scenario 4: User successfully completes the commitment
  test('Scenario 4: User successfully completes the commitment', async () => {
    const userId = 'user_s4';
    const interventionId = 'intervention_s4';

    // Create commitment first
    await conversationService.processMessage({
      userId,
      interventionId,
      message: 'I will study Java'
    });

    // Complete commitment
    const completionResult = await conversationService.processMessage({
      userId,
      interventionId,
      message: 'I completed my commitment and finished studying Java'
    });

    assert.ok(completionResult.commitment, 'Commitment should be returned');
    assert.strictEqual(completionResult.commitment.status, 'completed');
    assert.ok(completionResult.commitment.completionTimestamp, 'Completion timestamp must be set');
    assert.match(completionResult.response, /progress and discipline/i);

    // Verify episodic and behavioural memory
    const userMemory = await memoryService.getUserMemory(userId);
    assert.strictEqual(userMemory.episodic.completedCommitments.length, 1);
    assert.strictEqual(userMemory.episodic.completedCommitments[0].description, 'Study Java');
    assert.strictEqual(userMemory.behavioural.successfulCommitmentPatterns.count, 1);
  });

  // Scenario 5: User breaks a commitment
  test('Scenario 5: User breaks a commitment', async () => {
    const userId = 'user_s5';
    const interventionId = 'intervention_s5';

    // Create commitment
    await conversationService.processMessage({
      userId,
      interventionId,
      message: 'I will study Java'
    });

    // Break commitment
    const brokenResult = await conversationService.processMessage({
      userId,
      interventionId,
      message: "I gave up and broke my commitment, couldn't finish"
    });

    assert.ok(brokenResult.commitment, 'Commitment should be returned');
    assert.strictEqual(brokenResult.commitment.status, 'broken');
    assert.ok(brokenResult.commitment.completionTimestamp, 'Timestamp must be recorded');
    assert.match(brokenResult.response, /missed your commitment/i);

    // Verify memory tracking
    const userMemory = await memoryService.getUserMemory(userId);
    assert.strictEqual(userMemory.episodic.brokenCommitments.length, 1);
    assert.strictEqual(userMemory.behavioural.commonlyBrokenCommitments.count, 1);
  });

  // Scenario 6: User continues scrolling after a warning
  test('Scenario 6: User continues scrolling after a warning', async () => {
    const userId = 'user_s6';

    // Initial violation: warning issued
    const firstViolation = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Scroll limit threshold reached'
    });
    assert.strictEqual(firstViolation.action, 'warning');
    assert.strictEqual(firstViolation.violationCount, 1);
    assert.strictEqual(firstViolation.restrictionActive, false);

    // User continues scrolling after warning -> triggers second violation (15m restriction)
    const secondViolation = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Continued scrolling after initial warning'
    });
    assert.strictEqual(secondViolation.violationCount, 2);
    assert.strictEqual(secondViolation.action, 'restriction');
    assert.strictEqual(secondViolation.durationMinutes, 15);
  });

  // Scenario 7: Second violation triggers a 15-minute restriction
  test('Scenario 7: Second violation triggers a 15-minute restriction', async () => {
    const userId = 'user_s7';

    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    const result = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Continued scrolling after warning'
    });

    assert.strictEqual(result.action, 'restriction');
    assert.strictEqual(result.durationMinutes, 15);
    assert.strictEqual(result.restrictionActive, true);
    assert.strictEqual(result.currentRestriction.durationMinutes, 15);
    assert.strictEqual(result.currentRestriction.status, 'active');

    const isActive = await accountabilityService.isRestrictionActive(userId);
    assert.strictEqual(isActive, true);
  });

  // Scenario 8: Third violation triggers a 30-minute restriction
  test('Scenario 8: Third violation triggers a 30-minute restriction', async () => {
    const userId = 'user_s8';

    // Violation 1: Warning
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    // Violation 2: 15-min restriction
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });

    // Expire restriction to simulate time passing before 3rd violation
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());

    // Violation 3: 30-min restriction
    const thirdViolation = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Third strike scrolling'
    });

    assert.strictEqual(thirdViolation.violationCount, 3);
    assert.strictEqual(thirdViolation.action, 'restriction');
    assert.strictEqual(thirdViolation.durationMinutes, 30);
    assert.strictEqual(thirdViolation.currentRestriction.durationMinutes, 30);
    assert.strictEqual(thirdViolation.restrictionActive, true);
  });

  // Audit 1: Fourth violation triggers a 45-minute restriction
  test('Audit 1: Fourth violation triggers a 45-minute restriction', async () => {
    const userId = 'user_audit_v4';

    // Violations 1, 2, 3 (clearing expiry between each so they don't block due to stacking guard)
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());

    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());

    // Violation 4
    const v4Result = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Fourth scrolling infraction'
    });

    assert.strictEqual(v4Result.violationCount, 4);
    assert.strictEqual(v4Result.action, 'restriction');
    assert.strictEqual(v4Result.durationMinutes, 45);
    assert.strictEqual(v4Result.currentRestriction.durationMinutes, 45);
    assert.strictEqual(v4Result.restrictionActive, true);
  });

  // Audit 2: Fifth and subsequent violations trigger a 60-minute restriction
  test('Audit 2: Fifth violation triggers a 60-minute restriction', async () => {
    const userId = 'user_audit_v5';

    // Violations 1-4 with expired periods
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());

    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());

    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());

    // Violation 5
    const v5Result = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Fifth scrolling infraction'
    });

    assert.strictEqual(v5Result.violationCount, 5);
    assert.strictEqual(v5Result.action, 'restriction');
    assert.strictEqual(v5Result.durationMinutes, 60);
    assert.strictEqual(v5Result.currentRestriction.durationMinutes, 60);

    // Subsequent (6th) violation also caps at 60 minutes
    await accountabilityService.overrideRestrictionExpiry(userId, new Date(Date.now() - 1000).toISOString());
    const v6Result = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Sixth scrolling infraction'
    });
    assert.strictEqual(v6Result.violationCount, 6);
    assert.strictEqual(v6Result.durationMinutes, 60);
  });

  // Audit 3: Active restriction preventing another restriction (no stacking)
  test('Audit 3: Active restriction prevents stacking new restrictions', async () => {
    const userId = 'user_no_stack';

    // Violation 1 (warning)
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });

    // Violation 2 (15-min restriction triggered)
    const v2Result = await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    assert.strictEqual(v2Result.action, 'restriction');
    assert.strictEqual(v2Result.durationMinutes, 15);
    const initialExpiresAt = v2Result.currentRestriction.expiresAt;

    // Attempt to trigger another restriction while first is still active
    const stackAttempt = await accountabilityService.handleScrollViolation(userId, {
      verifiedScrolling: true,
      reason: 'Trying to trigger violation while active'
    });

    assert.strictEqual(stackAttempt.success, false);
    assert.strictEqual(stackAttempt.action, 'already_restricted');
    assert.strictEqual(stackAttempt.violationCount, 2, 'Violation count must NOT increment while restricted');
    assert.strictEqual(stackAttempt.currentRestriction.expiresAt, initialExpiresAt, 'Expiry must not change');
  });

  // Audit 4: Duplicate enforcement requests (idempotency)
  test('Audit 4: Duplicate enforcement requests cannot generate duplicate violations', async () => {
    const userId = 'user_idempotency';
    const eventId = 'enforce_event_abc123';

    // First enforcement call
    const firstCall = await accountabilityService.handleScrollViolation(userId, {
      eventId,
      verifiedScrolling: true,
      reason: 'Event 1 trigger'
    });
    assert.strictEqual(firstCall.violationCount, 1);
    assert.strictEqual(firstCall.isDuplicate, undefined);

    // Duplicate enforcement call with identical eventId
    const secondCall = await accountabilityService.handleScrollViolation(userId, {
      eventId,
      verifiedScrolling: true,
      reason: 'Event 1 trigger duplicate re-delivery'
    });

    assert.strictEqual(secondCall.isDuplicate, true);
    assert.strictEqual(secondCall.violationCount, 1, 'Violation count must remain 1');

    const userState = await accountabilityService.getUserAccountability(userId);
    assert.strictEqual(userState.violationCount, 1);
    assert.strictEqual(userState.history.length, 1);
  });

  // Audit 5: Different users have completely isolated memory
  test('Audit 5: Different users have completely isolated memory', async () => {
    const userA = 'user_alice';
    const userB = 'user_bob';

    // Alice makes commitment, extension request, and custom goal
    await memoryService.updateUserProfile(userA, { goals: ['Master Rust'] });
    await commitmentService.createCommitment({ userId: userA, description: 'Read Rust Book' });
    await negotiationService.requestExtension({ userId: userA, interventionId: 'int_alice', requestedMinutes: 10 });

    // Verify Bob's memory is completely untouched
    const bobMemory = await memoryService.getUserMemory(userB);
    const bobCommitments = await commitmentService.getCommitments(userB);
    const bobExtension = await negotiationService.getExtensionStatus('int_bob');

    assert.deepStrictEqual(bobMemory.profile.goals, [
      'Reduce Instagram Reels consumption',
      'Study and build projects'
    ]);
    assert.strictEqual(bobMemory.episodic.promisesMade.length, 0);
    assert.strictEqual(bobMemory.episodic.extensionRequests.length, 0);
    assert.strictEqual(bobCommitments.length, 0);
    assert.strictEqual(bobExtension, null);
  });

  // Audit 6: Memory persists across multiple conversations
  test('Audit 6: Memory and conversation history persist across multiple sessions', async () => {
    const userId = 'user_multi_session';

    // Session 1
    await conversationService.processMessage({
      userId,
      interventionId: 'session_1',
      message: 'I will study Java'
    });

    // Session 2
    await conversationService.processMessage({
      userId,
      interventionId: 'session_2',
      message: 'I finished studying Java and completed my commitment'
    });

    const memory = await memoryService.getUserMemory(userId);
    assert.strictEqual(memory.episodic.conversations.length, 2, 'Both sessions stored in episodic memory');
    assert.strictEqual(memory.episodic.conversations[0].interventionId, 'session_1');
    assert.strictEqual(memory.episodic.conversations[1].interventionId, 'session_2');

    // Commitments accessible across conversations
    const commitments = await commitmentService.getCommitments(userId);
    assert.strictEqual(commitments.length, 1);
    assert.strictEqual(commitments[0].status, 'completed');
  });

  // Scenario 9: Restriction expires correctly
  test('Scenario 9: Restriction expires correctly', async () => {
    const userId = 'user_s9';

    // Trigger 15-minute restriction
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });
    await accountabilityService.handleScrollViolation(userId, { verifiedScrolling: true });

    // Confirm restriction is active initially
    let active = await accountabilityService.isRestrictionActive(userId);
    assert.strictEqual(active, true);

    // Fast-forward expiry timestamp into the past
    const pastTimestamp = new Date(Date.now() - 1000).toISOString();
    await accountabilityService.overrideRestrictionExpiry(userId, pastTimestamp);

    // Verify restriction is now inactive and marked expired
    active = await accountabilityService.isRestrictionActive(userId);
    assert.strictEqual(active, false);

    const userAccountability = await accountabilityService.getUserAccountability(userId);
    assert.strictEqual(userAccountability.restrictionActive, false);
    assert.strictEqual(userAccountability.currentRestriction.status, 'expired');
  });

  // Scenario 10: Missed commitment without verified continued scrolling does NOT trigger a restriction
  test('Scenario 10: Missed commitment without verified continued scrolling does NOT trigger a restriction', async () => {
    const userId = 'user_s10';
    const interventionId = 'intervention_s10';

    // Create commitment
    const commitment = await commitmentService.createCommitment({
      userId,
      description: 'Study Java for 45 minutes'
    });

    // Mark commitment broken without verified scrolling
    await commitmentService.breakCommitment(commitment.id, {
      outcomeNotes: 'Missed deadline but phone was locked'
    });

    // Process event through conversation engine with verifiedScrolling = false
    await conversationService.processMessage({
      userId,
      interventionId,
      message: "I didn't study Java today, missed my commitment",
      event: {
        type: 'break_commitment',
        verifiedScrolling: false
      }
    });

    // Verify that NO restriction was triggered
    const restrictionActive = await accountabilityService.isRestrictionActive(userId);
    assert.strictEqual(restrictionActive, false, 'Restriction must NOT be active');

    const accountabilityState = await accountabilityService.getUserAccountability(userId);
    assert.strictEqual(accountabilityState.violationCount, 0, 'Violation count must remain 0');
    assert.strictEqual(accountabilityState.currentRestriction, null);
  });

  // REST API Endpoints Verification: Commitments, Memory, Accountability, Interventions
  test('REST Endpoints: Full verification of auxiliary management APIs', async () => {
    const server = app.listen(0);
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    try {
      // 1. POST /api/commitments
      const createRes = await fetch(`${baseUrl}/commitments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'user_rest',
          description: 'Practice Java Algorithms'
        })
      });
      assert.strictEqual(createRes.status, 201);
      const createJson = await createRes.json();
      assert.strictEqual(createJson.success, true);
      const commitmentId = createJson.data.id;

      // 2. PATCH /api/commitments/:id
      const patchRes = await fetch(`${baseUrl}/commitments/${commitmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'completed',
          outcomeNotes: 'Finished 5 problems'
        })
      });
      assert.strictEqual(patchRes.status, 200);
      const patchJson = await patchRes.json();
      assert.strictEqual(patchJson.data.status, 'completed');

      // 3. GET /api/commitments/:userId
      const getCommRes = await fetch(`${baseUrl}/commitments/user_rest`);
      assert.strictEqual(getCommRes.status, 200);
      const getCommJson = await getCommRes.json();
      assert.strictEqual(getCommJson.data.length, 1);

      // 4. GET /api/memory/:userId
      const memoryRes = await fetch(`${baseUrl}/memory/user_rest`);
      assert.strictEqual(memoryRes.status, 200);
      const memoryJson = await memoryRes.json();
      assert.ok(memoryJson.data.profile, 'profile exists');
      assert.ok(memoryJson.data.episodic, 'episodic exists');
      assert.ok(memoryJson.data.behavioural, 'behavioural exists');

      // 5. POST /api/accountability/enforce
      const enforceRes = await fetch(`${baseUrl}/accountability/enforce`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-enforcement-token': 'dev-enforcement-secret'
        },
        body: JSON.stringify({
          userId: 'user_rest',
          eventId: 'evt_rest_1',
          verifiedScrolling: true,
          reason: 'Excess scroll time'
        })
      });
      assert.strictEqual(enforceRes.status, 200);
      const enforceJson = await enforceRes.json();
      assert.strictEqual(enforceJson.data.action, 'warning');

      // 6. GET /api/accountability/:userId
      const accRes = await fetch(`${baseUrl}/accountability/user_rest`);
      assert.strictEqual(accRes.status, 200);
      const accJson = await accRes.json();
      assert.strictEqual(accJson.data.violationCount, 1);

      // 7. POST /api/interventions
      const intRes = await fetch(`${baseUrl}/interventions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interventionId: 'int_rest_1',
          userId: 'user_rest',
          thresholdMinutes: 30
        })
      });
      assert.strictEqual(intRes.status, 201);
    } finally {
      server.close();
    }
  });
});
