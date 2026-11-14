import prisma from '../config/database.js';
import { errorResponse } from '../utils/response.js';

export const requireTeamLeader = async (req, res, next) => {
  try {
    const teamId = req.params.teamId || req.params.id;
    if (!teamId) {
      return errorResponse(res, 'Team ID is required', 400, 'BAD_REQUEST');
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { id: true, leaderId: true, status: true, hackathonId: true, maxSize: true },
    });

    if (!team) {
      return errorResponse(res, 'Team not found', 404, 'TEAM_NOT_FOUND');
    }

    if (team.status === 'DISBANDED') {
      return errorResponse(res, 'Cannot perform operations on a disbanded team', 400, 'TEAM_DISBANDED');
    }

    if (team.leaderId !== req.user.id) {
      return errorResponse(res, 'Forbidden: Only the team leader can perform this action', 403, 'FORBIDDEN_NOT_LEADER');
    }

    req.team = team;
    next();
  } catch (error) {
    return errorResponse(res, 'Authorization check failed', 500, 'SERVER_ERROR');
  }
};

