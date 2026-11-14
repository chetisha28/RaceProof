import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { createAuditLog } from './audit.service.js';
import { eventEmitter, DOMAIN_EVENTS } from '../events/eventEmitter.js';

export const createTeam = async ({ name, description, hackathonId, maxSize = 4, leaderId }) => {
  // 1. Verify hackathon exists
  const hackathon = await prisma.hackathon.findUnique({
    where: { id: hackathonId },
  });

  if (!hackathon) {
    throw new AppError('Hackathon not found', 404, 'HACKATHON_NOT_FOUND');
  }

  // 2. Verify creator is not already in a team in this hackathon
  const existingMembership = await prisma.teamMember.findUnique({
    where: {
      unique_user_per_hackathon: {
        hackathonId,
        userId: leaderId,
      },
    },
    include: { team: true },
  });

  if (existingMembership) {
    throw new AppError(
      `You are already a member of team "${existingMembership.team.name}" in this hackathon.`,
      409,
      'ALREADY_IN_TEAM'
    );
  }

  // 3. Atomically create Team and TeamMember in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        hackathonId,
        leaderId,
        maxSize,
        status: 'ACTIVE',
      },
    });

    const member = await tx.teamMember.create({
      data: {
        teamId: team.id,
        hackathonId,
        userId: leaderId,
        role: 'LEADER',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, skills: true },
        },
      },
    });

    await createAuditLog(tx, {
      actorId: leaderId,
      teamId: team.id,
      action: 'TEAM_CREATED',
      metadata: { name: team.name, maxSize: team.maxSize, hackathonId },
    });

    return { team, member };
  });

  eventEmitter.emit(DOMAIN_EVENTS.TEAM_CREATED, {
    teamId: result.team.id,
    hackathonId,
    name: result.team.name,
    leaderId,
  });

  return result.team;
};

export const getTeams = async ({ hackathonId, search, skill, status = 'ACTIVE', page = 1, limit = 12 }) => {
  const where = {};

  if (hackathonId) {
    where.hackathonId = hackathonId;
  }

  if (status && status !== 'ALL') {
    where.status = status;
  } else if (!status || status === 'ALL') {
    where.status = { not: 'DISBANDED' };
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (skill) {
    where.members = {
      some: {
        user: {
          skills: {
            has: skill,
          },
        },
      },
    };
  }

  const skip = (page - 1) * limit;

  const [total, teams] = await Promise.all([
    prisma.team.count({ where }),
    prisma.team.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        hackathon: {
          select: { id: true, name: true },
        },
        leader: {
          select: { id: true, name: true, email: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, skills: true, githubUrl: true },
            },
          },
        },
        _count: {
          select: {
            members: true,
            joinRequests: {
              where: { status: 'PENDING' },
            },
          },
        },
      },
    }),
  ]);

  const formattedTeams = teams.map((team) => {
    const memberCount = team.members.length;
    const availableSeats = Math.max(0, team.maxSize - memberCount);
    // Aggregate distinct skills in the team
    const teamSkills = Array.from(new Set(team.members.flatMap((m) => m.user.skills || [])));

    return {
      ...team,
      memberCount,
      availableSeats,
      isFull: memberCount >= team.maxSize,
      teamSkills,
    };
  });

  return {
    teams: formattedTeams,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
};

export const getTeamById = async (teamId, requestingUserId = null) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      hackathon: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      leader: {
        select: { id: true, name: true, email: true, bio: true, skills: true, githubUrl: true },
      },
      members: {
        orderBy: { joinedAt: 'asc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, bio: true, skills: true, githubUrl: true },
          },
        },
      },
      _count: {
        select: {
          members: true,
          joinRequests: {
            where: { status: 'PENDING' },
          },
        },
      },
    },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  const memberCount = team.members.length;
  const availableSeats = Math.max(0, team.maxSize - memberCount);
  const isLeader = requestingUserId ? team.leaderId === requestingUserId : false;
  const isMember = requestingUserId ? team.members.some((m) => m.userId === requestingUserId) : false;

  let pendingRequests = [];
  if (isLeader) {
    pendingRequests = await prisma.joinRequest.findMany({
      where: { teamId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, bio: true, skills: true, githubUrl: true },
        },
      },
    });
  }

  return {
    ...team,
    memberCount,
    availableSeats,
    isFull: memberCount >= team.maxSize,
    isLeader,
    isMember,
    pendingRequests,
  };
};

export const updateTeam = async (teamId, userId, data) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { members: true },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  if (team.leaderId !== userId) {
    throw new AppError('Only the team leader can update team settings', 403, 'FORBIDDEN_NOT_LEADER');
  }

  if (data.maxSize !== undefined && data.maxSize < team.members.length) {
    throw new AppError(
      `Cannot reduce maximum size to ${data.maxSize} because the team already has ${team.members.length} members`,
      400,
      'CAPACITY_LESS_THAN_MEMBERS'
    );
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: {
      ...(data.name && { name: data.name.trim() }),
      ...(data.description && { description: data.description.trim() }),
      ...(data.maxSize !== undefined && { maxSize: data.maxSize }),
    },
  });

  eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, { teamId, changes: data });

  return updated;
};

export const disbandTeam = async (teamId, userId) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  if (team.leaderId !== userId) {
    throw new AppError('Only the team leader can disband the team', 403, 'FORBIDDEN_NOT_LEADER');
  }

  await prisma.$transaction(async (tx) => {
    // Delete team or mark DISBANDED
    await tx.team.update({
      where: { id: teamId },
      data: { status: 'DISBANDED' },
    });

    // Remove members so they can join another team
    await tx.teamMember.deleteMany({
      where: { teamId },
    });

    // Cancel all pending requests
    await tx.joinRequest.updateMany({
      where: { teamId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    await createAuditLog(tx, {
      actorId: userId,
      teamId,
      action: 'TEAM_DISBANDED',
      metadata: { teamName: team.name },
    });
  });

  eventEmitter.emit(DOMAIN_EVENTS.TEAM_DISBANDED, { teamId, hackathonId: team.hackathonId });

  return { message: 'Team successfully disbanded' };
};

