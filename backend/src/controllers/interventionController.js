import { z } from 'zod';
import conversationService from '../services/conversationService.js';
import memoryService from '../services/memoryService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const startInterventionSchema = z.object({
  interventionId: z.string().min(1, 'interventionId is required'),
  userId: z.string().min(1, 'userId is required'),
  thresholdMinutes: z.number().optional(),
  appName: z.string().default('Instagram')
});

export const recordIntervention = async (req, res, next) => {
  try {
    const parseResult = startInterventionSchema.safeParse(req.body);
    if (!parseResult.success) {
      return errorResponse(res, 'Validation error', 400, parseResult.error.flatten().fieldErrors);
    }

    const { interventionId, userId, thresholdMinutes, appName } = parseResult.data;

    // Record session initialization
    const session = await conversationService.getSession(interventionId);
    return successResponse(
      res,
      {
        interventionId,
        userId,
        thresholdMinutes: thresholdMinutes || 30,
        appName,
        status: 'initiated',
        existingSession: session !== null
      },
      201
    );
  } catch (error) {
    next(error);
  }
};

export const getIntervention = async (req, res, next) => {
  try {
    const { interventionId } = req.params;
    const session = await conversationService.getSession(interventionId);
    if (!session) {
      return errorResponse(res, `Intervention session not found: ${interventionId}`, 404);
    }

    return successResponse(res, session, 200);
  } catch (error) {
    next(error);
  }
};

