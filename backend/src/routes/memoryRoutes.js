import { Router } from 'express';
import { getUserMemory } from '../controllers/memoryController.js';

const router = Router();

router.get('/:userId', getUserMemory);

export default router;

