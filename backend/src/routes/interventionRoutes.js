import { Router } from 'express';
import { recordIntervention, getIntervention } from '../controllers/interventionController.js';

const router = Router();

router.post('/', recordIntervention);
router.get('/:interventionId', getIntervention);

export default router;

