import { Router } from 'express';
import * as inviteController from '../controllers/invite.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { inviteInspectLimiter, inviteAcceptLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.get('/:token', inviteInspectLimiter, inviteController.getInvite);
router.post('/:token/accept', inviteAcceptLimiter, authenticateToken, inviteController.acceptInvite);

export default router;
