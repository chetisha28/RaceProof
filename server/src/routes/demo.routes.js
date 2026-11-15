import { Router } from 'express';
import { runLiveConcurrencyTest } from '../controllers/demo.controller.js';
import { demoLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

// Authentic Live Concurrency Benchmark Endpoint
// Rate limited to prevent denial-of-service, fully isolated test dataset
router.post('/concurrency-benchmark', demoLimiter, runLiveConcurrencyTest);

export default router;
