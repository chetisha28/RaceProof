import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { createAuditLog } from './audit.service.js';
import { eventEmitter, DOMAIN_EVENTS } from '../events/eventEmitter.js';

export const createJoinRequest = async (teamId, userId, message = '') => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: true,
      hackathon: true,
    },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  if (team.status === 'DISBANDED') {
    throw new AppError('Cannot send request to a disbanded team', 400, 'TEAM_DISBANDED');
  }

  if (team.members.length >= team.maxSize) {
    throw new AppError('Team has already reached maximum capacity', 409, 'TEAM_FULL');
  }

  // 1. Check if user is already in a team in this hackathon
  const existingMembership = await prisma.teamMember.findUnique({
    where: {
      unique_user_per_hackathon: {
        hackathonId: team.hackathonId,
        userId,
      },
    },
  });

  if (existingMembership) {
    throw new AppError('You are already a member of a team in this hackathon', 409, 'ALREADY_IN_TEAM');
  }

  // 2. Prevent duplicate pending requests to the same team
  const existingPending = await prisma.joinRequest.findFirst({
    where: {
      teamId,
      userId,
      status: 'PENDING',
    },
  });

  if (existingPending) {
    throw new AppError('You already have a pending join request for this team', 409, 'DUPLICATE_PENDING_REQUEST');
  }

  const request = await prisma.joinRequest.create({
    data: {
      teamId,
      userId,
      message: message ? message.trim() : null,
      status: 'PENDING',
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, skills: true, bio: true, githubUrl: true },
      },
    },
  });

  await createAuditLog(prisma, {
    actorId: userId,
    teamId,
    action: 'REQUEST_SUBMITTED',
    metadata: { requestId: request.id, message },
  });

  eventEmitter.emit(DOMAIN_EVENTS.REQUEST_CREATED, {
    requestId: request.id,
    teamId,
    user: request.user,
  });

  return request;
};

export const getTeamRequests = async (teamId, leaderId) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { leaderId: true },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  if (team.leaderId !== leaderId) {
    throw new AppError('Only the team leader can view join requests', 403, 'FORBIDDEN_NOT_LEADER');
  }

  return prisma.joinRequest.findMany({
    where: { teamId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: { id: true, name: true, email: true, bio: true, skills: true, githubUrl: true },
      },
    },
  });
};

export const getMyRequests = async (userId) => {
  return prisma.joinRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      team: {
        include: {
          hackathon: { select: { id: true, name: true } },
          leader: { select: { id: true, name: true } },
          _count: { select: { members: true } },
        },
      },
    },
  });
};

export const cancelJoinRequest = async (requestId, userId) => {
  const request = await prisma.joinRequest.findUnique({
    where: { id: requestId },
  });

  if (!request) {
    throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.userId !== userId) {
    throw new AppError('You can only cancel your own join requests', 403, 'FORBIDDEN');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(`Cannot cancel a request that is already ${request.status.toLowerCase()}`, 400, 'REQUEST_NOT_PENDING');
  }

  const updated = await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  });

  await createAuditLog(prisma, {
    actorId: userId,
    teamId: request.teamId,
    action: 'REQUEST_CANCELLED',
    metadata: { requestId },
  });

  eventEmitter.emit(DOMAIN_EVENTS.REQUEST_CANCELLED, {
    requestId,
    teamId: request.teamId,
    userId,
  });

  return updated;
};

export const declineJoinRequest = async (requestId, leaderId) => {
  const request = await prisma.joinRequest.findUnique({
    where: { id: requestId },
    include: { team: true },
  });

  if (!request) {
    throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
  }

  if (request.team.leaderId !== leaderId) {
    throw new AppError('Only the team leader can decline requests', 403, 'FORBIDDEN_NOT_LEADER');
  }

  if (request.status !== 'PENDING') {
    throw new AppError(`Cannot decline a request that is already ${request.status.toLowerCase()}`, 400, 'REQUEST_NOT_PENDING');
  }

  const updated = await prisma.joinRequest.update({
    where: { id: requestId },
    data: { status: 'DECLINED' },
  });

  await createAuditLog(prisma, {
    actorId: leaderId,
    teamId: request.teamId,
    action: 'REQUEST_DECLINED',
    metadata: { requestId, declinedUserId: request.userId },
  });

  eventEmitter.emit(DOMAIN_EVENTS.REQUEST_DECLINED, {
    requestId,
    teamId: request.teamId,
    userId: request.userId,
  });

  return updated;
};

