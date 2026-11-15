import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticateToken } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { registerSchema, loginSchema, updateProfileSchema } from '../validators/auth.validator.js';
import { loginLimiter, registerLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.post('/register', registerLimiter, validateBody(registerSchema), authController.register);
router.post('/login', loginLimiter, validateBody(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticateToken, authController.me);
router.patch('/me', authenticateToken, validateBody(updateProfileSchema), authController.updateProfile);

export default router;
