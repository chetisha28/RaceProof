import { Router } from 'express';
import * as sseController from '../controllers/sse.controller.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/', optionalAuth, sseController.subscribe);

export default router;

