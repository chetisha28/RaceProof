import { Router } from 'express';
import * as requestController from '../controllers/request.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';

const router = Router();

router.get('/my', authenticateToken, requestController.getMyRequests);
router.patch('/:id/accept', authenticateToken, requestController.acceptRequest);
router.patch('/:id/decline', authenticateToken, requestController.declineRequest);
router.delete('/:id', authenticateToken, requestController.cancelRequest);

export default router;

