import { Router } from 'express';
import * as inviteController from '../controllers/invite.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/:token', inviteController.getInvite);
router.post('/:token/accept', authenticateToken, inviteController.acceptInvite);

export default router;

