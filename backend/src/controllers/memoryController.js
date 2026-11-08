import memoryService from '../services/memoryService.js';
import { successResponse, errorResponse } from '../utils/responseHelpers.js';

export const getUserMemory = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId || !userId.trim()) {
      return errorResponse(res, 'userId is required', 400);
    }

    const memory = await memoryService.getUserMemory(userId.trim());
    return successResponse(res, memory, 200);
  } catch (error) {
    next(error);
  }
};

