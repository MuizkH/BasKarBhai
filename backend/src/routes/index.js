import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import conversationRoutes from './conversationRoutes.js';
import commitmentRoutes from './commitmentRoutes.js';
import memoryRoutes from './memoryRoutes.js';
import accountabilityRoutes from './accountabilityRoutes.js';
import interventionRoutes from './interventionRoutes.js';

const router = Router();

router.use('/health', healthRoutes);
router.use('/conversation', conversationRoutes);
router.use('/commitments', commitmentRoutes);
router.use('/memory', memoryRoutes);
router.use('/accountability', accountabilityRoutes);
router.use('/interventions', interventionRoutes);

export default router;
