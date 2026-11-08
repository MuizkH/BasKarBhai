import { Router } from 'express';
import {
  createCommitment,
  updateCommitment,
  getCommitments
} from '../controllers/commitmentController.js';

const router = Router();

router.post('/', createCommitment);
router.patch('/:id', updateCommitment);
router.get('/:userId', getCommitments);

export default router;

