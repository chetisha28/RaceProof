import { Router } from 'express';
import * as hackathonController from '../controllers/hackathon.controller.js';

const router = Router();

router.get('/', hackathonController.getHackathons);
router.get('/:id', hackathonController.getHackathon);

export default router;

