import { z } from 'zod';
import conversationService from '../services/conversationService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';
import { env } from '../config/env.js';

const conversationSchema = z.object({
  userId: z.string({ required_error: 'userId is required' }).min(1, 'userId cannot be empty'),
  interventionId: z
    .string({ required_error: 'interventionId is required' })
    .min(1, 'interventionId cannot be empty'),
  message: z.string({ required_error: 'message is required' }).min(1, 'message cannot be empty'),
  event: z
    .object({
      type: z.string(),
      eventId: z.string().optional(),
      verifiedScrolling: z.boolean().optional(),
      minutes: z.number().optional(),
      description: z.string().optional(),
      deadline: z.string().optional(),
      reason: z.string().optional()
    })
    .optional()
    .nullable()
});

/**
 * Conversation Controller
 * Handles POST /api/conversation
 */
export const handleConversation = async (req, res, next) => {
  try {
    const parseResult = conversationSchema.safeParse(req.body);

    if (!parseResult.success) {
      return errorResponse(
        res,
        'Invalid conversation request payload',
        400,
        parseResult.error.flatten().fieldErrors
      );
    }

    const { userId, interventionId, message, event } = parseResult.data;

    // Security Guard: Check if client claims verified scrolling
    let isTrusted = true;
    if (event?.verifiedScrolling) {
      const enforcementToken = req.headers['x-enforcement-token'];
      if (env.NODE_ENV === 'production' && enforcementToken !== env.ENFORCEMENT_SECRET) {
        isTrusted = false;
      }
    }

    const processedEvent = event
      ? {
          ...event,
          isTrusted
        }
      : null;

    const data = await conversationService.processMessage({
      userId,
      interventionId,
      message,
      event: processedEvent
    });

    return successResponse(res, data, 200);
  } catch (error) {
    next(error);
  }
};

