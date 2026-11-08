import { z } from 'zod';
import accountabilityService from '../services/accountabilityService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import { env } from '../config/env.js';

const enforceSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  interventionId: z.string().optional().nullable(),
  eventId: z.string().optional().nullable(),
  verifiedScrolling: z.boolean(),
  reason: z.string().optional()
});

export const getAccountabilityState = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId || !userId.trim()) {
      return errorResponse(res, 'userId is required', 400);
    }

    const state = await accountabilityService.getUserAccountability(userId.trim());
    return successResponse(res, state, 200);
  } catch (error) {
    next(error);
  }
};

export const enforceScrollingViolation = async (req, res, next) => {
  try {
    const parseResult = enforceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return errorResponse(res, 'Validation error', 400, parseResult.error.flatten().fieldErrors);
    }

    const token = req.headers['x-enforcement-token'];
    const isTrusted =
      env.NODE_ENV !== 'production' || token === env.ENFORCEMENT_SECRET;

    const { userId, interventionId, eventId, verifiedScrolling, reason } = parseResult.data;

    const result = await accountabilityService.handleScrollViolation(userId, {
      interventionId: interventionId || null,
      eventId: eventId || null,
      verifiedScrolling,
      reason: reason || 'Verified scrolling violation',
      isTrusted
    });

    return successResponse(res, result, 200);
  } catch (error) {
    next(error);
  }
};

