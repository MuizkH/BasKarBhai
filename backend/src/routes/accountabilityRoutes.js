import { Router } from 'express';
import {
  getAccountabilityState,
  enforceScrollingViolation
} from '../controllers/accountabilityController.js';

const router = Router();

router.get('/:userId', getAccountabilityState);
router.post('/enforce', enforceScrollingViolation);

export default router;

