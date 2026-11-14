import * as concurrencyService from '../services/concurrency.service.js';
import prisma from '../config/database.js';
import { successResponse } from '../utils/response.js';

export const getMembers = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      orderBy: { joinedAt: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, bio: true, skills: true, githubUrl: true },
        },
      },
    });
    return successResponse(res, members, 'Team members retrieved');
  } catch (err) {
    next(err);
  }
};

export const removeMember = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const targetUserId = req.params.userId;
    const result = await concurrencyService.removeMemberWithLock(teamId, targetUserId, req.user.id);
    return successResponse(res, result, 'Member removed from team');
  } catch (err) {
    next(err);
  }
};

export const leaveTeam = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const result = await concurrencyService.leaveTeamWithLock(teamId, req.user.id);
    return successResponse(res, result, result.disbanded ? 'Left team and team disbanded' : 'Successfully left the team');
  } catch (err) {
    next(err);
  }
};

export const transferLeadership = async (req, res, next) => {
  try {
    const teamId = req.params.id;
    const { newLeaderId } = req.body;
    const result = await concurrencyService.transferLeadershipWithLock(teamId, req.user.id, newLeaderId);
    return successResponse(res, result, 'Leadership transferred successfully');
  } catch (err) {
    next(err);
  }
};

