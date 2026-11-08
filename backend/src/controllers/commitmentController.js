import { z } from 'zod';
import commitmentService from '../services/commitmentService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

const createCommitmentSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  description: z.string().min(1, 'description is required'),
  deadline: z.string().datetime().optional().nullable(),
  outcomeNotes: z.string().optional().nullable()
});

const updateCommitmentSchema = z.object({
  status: z.enum(['completed', 'broken'], {
    errorMap: () => ({ message: "status must be 'completed' or 'broken'" })
  }),
  outcomeNotes: z.string().optional().nullable()
});

export const createCommitment = async (req, res, next) => {
  try {
    const parseResult = createCommitmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return errorResponse(res, 'Validation error', 400, parseResult.error.flatten().fieldErrors);
    }

    const commitment = await commitmentService.createCommitment(parseResult.data);
    return successResponse(res, commitment, 201);
  } catch (error) {
    next(error);
  }
};

export const updateCommitment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const parseResult = updateCommitmentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return errorResponse(res, 'Validation error', 400, parseResult.error.flatten().fieldErrors);
    }

    const { status, outcomeNotes } = parseResult.data;
    let updated;
    if (status === 'completed') {
      updated = await commitmentService.completeCommitment(id, { outcomeNotes });
    } else {
      updated = await commitmentService.breakCommitment(id, { outcomeNotes });
    }

    return successResponse(res, updated, 200);
  } catch (error) {
    if (error.message.includes('cannot be marked') || error.message.includes('not found')) {
      return errorResponse(res, error.message, 400);
    }
    next(error);
  }
};

export const getCommitments = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    const list = await commitmentService.getCommitments(userId, { status });
    return successResponse(res, list, 200);
  } catch (error) {
    next(error);
  }
};

