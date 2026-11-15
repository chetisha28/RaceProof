import { Router } from 'express';
import * as teamController from '../controllers/team.controller.js';
import * as requestController from '../controllers/request.controller.js';
import * as memberController from '../controllers/member.controller.js';
import * as inviteController from '../controllers/invite.controller.js';
import * as auditController from '../controllers/audit.controller.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.middleware.js';
import { validateBody, validateQuery } from '../middleware/validate.middleware.js';
import {
  createTeamSchema,
  updateTeamSchema,
  joinRequestSchema,
  inviteSchema,
  transferLeadershipSchema,
} from '../validators/team.validator.js';
import { teamQuerySchema } from '../validators/query.validator.js';

const router = Router();

// Team Core Endpoints
router.post('/', authenticateToken, validateBody(createTeamSchema), teamController.createTeam);
router.get('/', optionalAuth, validateQuery(teamQuerySchema), teamController.getTeams);
router.get('/:id', optionalAuth, teamController.getTeam);
router.patch('/:id', authenticateToken, validateBody(updateTeamSchema), teamController.updateTeam);
router.delete('/:id', authenticateToken, teamController.disbandTeam);

// Join Requests Sub-routes
router.post('/:id/requests', authenticateToken, validateBody(joinRequestSchema), requestController.createRequest);
router.get('/:id/requests', authenticateToken, requestController.getTeamRequests);

// Membership Sub-routes
router.get('/:id/members', memberController.getMembers);
router.delete('/:id/members/:userId', authenticateToken, memberController.removeMember);
router.post('/:id/leave', authenticateToken, memberController.leaveTeam);
router.post('/:id/transfer-leadership', authenticateToken, validateBody(transferLeadershipSchema), memberController.transferLeadership);

// Invitations Sub-routes
router.post('/:id/invites', authenticateToken, validateBody(inviteSchema), inviteController.createInvite);

// Audit Logs Sub-route
router.get('/:id/audit-logs', optionalAuth, auditController.getAuditLogs);

// Teammate Suggestions Sub-route (Task 5)
router.get('/:id/suggestions', optionalAuth, teamController.getSuggestions);

export default router;

