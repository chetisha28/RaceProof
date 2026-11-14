import { Router } from 'express';
import authRoutes from './auth.routes.js';
import hackathonRoutes from './hackathon.routes.js';
import teamRoutes from './team.routes.js';
import requestRoutes from './request.routes.js';
import inviteRoutes from './invite.routes.js';
import sseRoutes from './sse.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/hackathons', hackathonRoutes);
router.use('/teams', teamRoutes);
router.use('/requests', requestRoutes);
router.use('/invites', inviteRoutes);
router.use('/sse', sseRoutes);

export default router;

