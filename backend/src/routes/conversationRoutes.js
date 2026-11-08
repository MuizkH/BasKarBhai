import { Router } from 'express';
import { handleConversation } from '../controllers/conversationController.js';

const router = Router();

router.post('/', handleConversation);

export default router;

