import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { generateSecureToken, hashSecureToken } from '../utils/crypto.js';
import { createAuditLog } from './audit.service.js';
import { eventEmitter, DOMAIN_EVENTS } from '../events/eventEmitter.js';

export const createInvite = async (teamId, leaderId, expiresInHours = 24) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  if (team.leaderId !== leaderId) {
    throw new AppError('Only the team leader can generate invitations', 403, 'FORBIDDEN_NOT_LEADER');
  }

  if (team.status === 'DISBANDED') {
    throw new AppError('Cannot create invites for a disbanded team', 400, 'TEAM_DISBANDED');
  }

  if (team.members.length >= team.maxSize) {
    throw new AppError('Cannot invite members to an already full team', 409, 'TEAM_FULL');
  }

  const rawToken = generateSecureToken();
  const tokenHash = hashSecureToken(rawToken);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  const invite = await prisma.invite.create({
    data: {
      teamId,
      tokenHash,
      createdBy: leaderId,
      expiresAt,
    },
  });

  await createAuditLog(prisma, {
    actorId: leaderId,
    teamId,
    action: 'INVITE_GENERATED',
    metadata: { inviteId: invite.id, expiresAt: expiresAt.toISOString() },
  });

  eventEmitter.emit(DOMAIN_EVENTS.INVITE_CREATED, { teamId, inviteId: invite.id });

  return {
    inviteId: invite.id,
    token: rawToken, // ONLY return raw token once upon creation
    expiresAt: invite.expiresAt,
    teamId,
  };
};

export const getInviteDetails = async (token) => {
  const tokenHash = hashSecureToken(token);

  const invite = await prisma.invite.findUnique({
    where: { tokenHash },
    include: {
      team: {
        include: {
          hackathon: { select: { id: true, name: true } },
          leader: { select: { id: true, name: true } },
          members: {
            include: { user: { select: { id: true, name: true, skills: true } } },
          },
        },
      },
      creator: { select: { id: true, name: true } },
    },
  });

  if (!invite) {
    throw new AppError('Invitation link is invalid or does not exist', 404, 'INVITE_NOT_FOUND');
  }

  const isExpired = new Date() > new Date(invite.expiresAt);
  const isUsed = !!invite.usedAt;
  const isFull = invite.team.members.length >= invite.team.maxSize;

  return {
    valid: !isExpired && !isUsed && !isFull,
    isExpired,
    isUsed,
    isFull,
    team: invite.team,
    expiresAt: invite.expiresAt,
    creator: invite.creator,
  };
};

