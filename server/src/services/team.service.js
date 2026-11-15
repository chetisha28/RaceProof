import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { createAuditLog } from './audit.service.js';
import { eventEmitter, DOMAIN_EVENTS } from '../events/eventEmitter.js';

// High-performance in-memory cache for discovery board with event-driven invalidation
const teamDiscoveryCache = new Map();
const inFlightQueries = new Map();
const CACHE_TTL_MS = 3000;

export const invalidateTeamCache = () => {
  teamDiscoveryCache.clear();
  inFlightQueries.clear();
};

// Wire cache invalidation on team mutation domain events
eventEmitter.on(DOMAIN_EVENTS.TEAM_CREATED, invalidateTeamCache);
eventEmitter.on(DOMAIN_EVENTS.TEAM_UPDATED, invalidateTeamCache);
eventEmitter.on(DOMAIN_EVENTS.TEAM_DISBANDED, invalidateTeamCache);
eventEmitter.on(DOMAIN_EVENTS.MEMBER_JOINED, invalidateTeamCache);
eventEmitter.on(DOMAIN_EVENTS.MEMBER_LEFT, invalidateTeamCache);

/**
 * Normalizes skill string for accurate case-insensitive and symbol-agnostic matching
 */
export const normalizeSkill = (skill) => {
  return String(skill || '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-_.]/g, '');
};

/**
 * Computes timezone offset in minutes relative to UTC
 */
export const getTimezoneOffsetMinutes = (timeZone) => {
  try {
    const now = new Date();
    const tzDate = new Date(now.toLocaleString('en-US', { timeZone }));
    const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch (e) {
    const match = String(timeZone || '').match(/([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (match) {
      const sign = match[1] === '-' ? -1 : 1;
      const hours = parseInt(match[2], 10);
      const mins = match[3] ? parseInt(match[3], 10) : 0;
      return sign * (hours * 60 + mins);
    }
    return 0; // Default UTC
  }
};

export const createTeam = async ({
  name,
  description,
  hackathonId,
  minSize = 2,
  maxSize = 4,
  requiredSkills = [],
  leaderId,
}) => {
  // 1. Verify hackathon exists
  const hackathon = await prisma.hackathon.findUnique({
    where: { id: hackathonId },
  });

  if (!hackathon) {
    throw new AppError('Hackathon not found', 404, 'HACKATHON_NOT_FOUND');
  }

  // 2. Validate minSize <= maxSize bounds
  if (minSize > maxSize) {
    throw new AppError('Minimum team size cannot exceed maximum capacity', 400, 'INVALID_CAPACITY_BOUNDS');
  }

  if (minSize < 2 || maxSize > 10) {
    throw new AppError('Team capacity must be configured between 2 and 10 members', 400, 'CAPACITY_OUT_OF_BOUNDS');
  }

  // 3. Verify creator is not already in a team in this hackathon
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

  // 4. Atomically create Team and TeamMember in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name: name.trim(),
        description: description.trim(),
        hackathonId,
        leaderId,
        minSize,
        maxSize,
        requiredSkills: requiredSkills || [],
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
          select: { id: true, name: true, email: true, skills: true, timezone: true },
        },
      },
    });

    await createAuditLog(tx, {
      actorId: leaderId,
      teamId: team.id,
      action: 'TEAM_CREATED',
      metadata: { name: team.name, minSize: team.minSize, maxSize: team.maxSize, hackathonId },
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
  const cacheKey = JSON.stringify({ hackathonId, search, skill, status, page, limit });
  const cached = teamDiscoveryCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // SingleFlight: If an identical query is currently in-flight, coalesce onto it
  let inFlight = inFlightQueries.get(cacheKey);
  if (inFlight) {
    return await inFlight;
  }

  const queryExecution = (async () => {
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
      where.OR = [
        {
          members: {
            some: {
              user: {
                skills: {
                  has: skill,
                },
              },
            },
          },
        },
        {
          requiredSkills: {
            has: skill,
          },
        },
      ];
    }

    const skip = (page - 1) * limit;

    // Optimized discovery query with privacy protection (no public email leakage)
    const teams = await prisma.team.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        hackathon: {
          select: { id: true, name: true },
        },
        leader: {
          select: { id: true, name: true, timezone: true },
        },
        members: {
          select: {
            id: true,
            role: true,
            user: {
              select: { id: true, name: true, skills: true },
            },
          },
        },
      },
    });

    // Avoid redundant count query if first page has fewer items than limit
    let total = teams.length;
    if (page > 1 || teams.length === limit) {
      total = await prisma.team.count({ where });
    }

    const formattedTeams = teams.map((team) => {
      const memberCount = team.members.length;
      const availableSeats = Math.max(0, team.maxSize - memberCount);
      const teamSkills = Array.from(new Set(team.members.flatMap((m) => m.user.skills || [])));

      return {
        ...team,
        memberCount,
        availableSeats,
        isFull: memberCount >= team.maxSize,
        meetsMinimum: memberCount >= team.minSize,
        teamSkills,
      };
    });

    const responsePayload = {
      teams: formattedTeams,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };

    teamDiscoveryCache.set(cacheKey, {
      data: responsePayload,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return responsePayload;
  })();

  inFlightQueries.set(cacheKey, queryExecution);
  try {
    return await queryExecution;
  } finally {
    inFlightQueries.delete(cacheKey);
  }
};

export const getTeamById = async (teamId, requestingUserId = null) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      hackathon: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
      leader: {
        select: { id: true, name: true, email: true, bio: true, skills: true, timezone: true, githubUrl: true },
      },
      members: {
        orderBy: { joinedAt: 'asc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, bio: true, skills: true, timezone: true, githubUrl: true },
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
          select: { id: true, name: true, email: true, bio: true, skills: true, timezone: true, githubUrl: true },
        },
      },
    });
  }

  return {
    ...team,
    memberCount,
    availableSeats,
    isFull: memberCount >= team.maxSize,
    meetsMinimum: memberCount >= team.minSize,
    isLeader,
    isMember,
    pendingRequests,
  };
};

export const updateTeam = async (teamId, userId, data) => {
  // Phase 3B: Pessimistic Row Locking on Team Capacity Updates
  // Serialized using SELECT ... FOR UPDATE within a transaction
  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Lock the team row
      const lockedTeams = await tx.$queryRaw`
        SELECT id, "name", "description", "hackathonId", "leaderId", "minSize", "maxSize", status, "requiredSkills"
        FROM "Team"
        WHERE id = ${teamId}
        FOR UPDATE
      `;

      if (!lockedTeams || lockedTeams.length === 0) {
        throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
      }

      const team = lockedTeams[0];

      if (team.status === 'DISBANDED') {
        throw new AppError('Cannot update settings of a disbanded team', 400, 'TEAM_DISBANDED');
      }

      if (team.leaderId !== userId) {
        throw new AppError('Only the team leader can update team settings', 403, 'FORBIDDEN_NOT_LEADER');
      }

      // 2. Count current active members inside the lock
      const currentMemberCount = await tx.teamMember.count({
        where: { teamId },
      });

      const newMinSize = data.minSize !== undefined ? data.minSize : team.minSize;
      const newMaxSize = data.maxSize !== undefined ? data.maxSize : team.maxSize;

      if (newMinSize > newMaxSize) {
        throw new AppError('minSize cannot exceed maxSize', 400, 'INVALID_CAPACITY_BOUNDS');
      }

      if (data.maxSize !== undefined && data.maxSize < currentMemberCount) {
        throw new AppError(
          `Cannot reduce maximum size to ${data.maxSize} because the team already has ${currentMemberCount} members`,
          400,
          'CAPACITY_LESS_THAN_MEMBERS'
        );
      }

      // 3. Update status to FULL if members reached newMaxSize, or ACTIVE if open
      let newStatus = team.status;
      if (currentMemberCount >= newMaxSize) {
        newStatus = 'FULL';
      } else if (team.status === 'FULL' && currentMemberCount < newMaxSize) {
        newStatus = 'ACTIVE';
      }

      const updated = await tx.team.update({
        where: { id: teamId },
        data: {
          ...(data.name && { name: data.name.trim() }),
          ...(data.description !== undefined && { description: data.description.trim() }),
          ...(data.minSize !== undefined && { minSize: data.minSize }),
          ...(data.maxSize !== undefined && { maxSize: data.maxSize }),
          ...(data.requiredSkills !== undefined && { requiredSkills: data.requiredSkills }),
          status: newStatus,
        },
      });

      // 4. Create Audit Log inside transaction
      await createAuditLog(tx, {
        actorId: userId,
        teamId,
        action: 'TEAM_UPDATED',
        metadata: {
          previousMinSize: team.minSize,
          previousMaxSize: team.maxSize,
          newMinSize,
          newMaxSize,
          memberCountAtUpdate: currentMemberCount,
          changes: data,
        },
      });

      return updated;
    },
    { timeout: 15000 }
  );

  eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, { teamId, changes: data });

  return result;
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

/**
 * Teammate Recommendation Engine
 * Recommends available hackathon participants based on:
 * - 70% Skill Compatibility (matching required skills or complementary skill overlap)
 * - 30% Timezone Compatibility (proximity of active working hours)
 */
export const getTeamSuggestions = async (teamId, limit = 10) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      leader: { select: { id: true, timezone: true } },
      members: {
        include: {
          user: { select: { id: true, skills: true, timezone: true } },
        },
      },
    },
  });

  if (!team) {
    throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
  }

  // 1. Identify existing team skills and required skills
  const existingMemberIds = new Set(team.members.map((m) => m.userId));
  const teamRequiredSkills = (team.requiredSkills || []).map(normalizeSkill);
  const teamCurrentSkills = new Set(team.members.flatMap((m) => (m.user.skills || []).map(normalizeSkill)));

  // Target skills: either explicit requiredSkills, or complementary core skills not present
  const targetSkills = teamRequiredSkills.length > 0 ? teamRequiredSkills : Array.from(teamCurrentSkills);

  const leaderOffset = getTimezoneOffsetMinutes(team.leader?.timezone || 'UTC');

  // 2. Query candidates: participants NOT in any team in this hackathon
  const busyUserMemberships = await prisma.teamMember.findMany({
    where: { hackathonId: team.hackathonId },
    select: { userId: true },
  });
  const busyUserIds = new Set(busyUserMemberships.map((m) => m.userId));

  // Query candidate pool with database-level prioritization:
  // Prioritize candidates with matching skills if requiredSkills are configured
  let candidates = [];
  if (team.requiredSkills && team.requiredSkills.length > 0) {
    const matchingCandidates = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(busyUserIds) },
        skills: { hasSome: team.requiredSkills },
      },
      select: {
        id: true,
        name: true,
        bio: true,
        skills: true,
        timezone: true,
        githubUrl: true,
      },
      take: 500,
    });

    const matchingIds = new Set(matchingCandidates.map((c) => c.id));
    candidates = [...matchingCandidates];

    // If matching pool is small, backfill with complementary candidates
    if (candidates.length < 100) {
      const remainingCandidates = await prisma.user.findMany({
        where: {
          id: { notIn: [...Array.from(busyUserIds), ...Array.from(matchingIds)] },
        },
        select: {
          id: true,
          name: true,
          bio: true,
          skills: true,
          timezone: true,
          githubUrl: true,
        },
        take: 100 - candidates.length,
      });
      candidates.push(...remainingCandidates);
    }
  } else {
    // No explicit required skills: fetch up to 500 eligible candidates
    candidates = await prisma.user.findMany({
      where: {
        id: { notIn: Array.from(busyUserIds) },
      },
      select: {
        id: true,
        name: true,
        bio: true,
        skills: true,
        timezone: true,
        githubUrl: true,
      },
      take: 500,
    });
  }

  // 3. Compute score for each candidate (70% Skill, 30% Timezone)
  const scoredCandidates = candidates.map((candidate) => {
    const candidateSkillsRaw = candidate.skills || [];
    const candidateSkillsNorm = candidateSkillsRaw.map(normalizeSkill);

    // Skill Score (70% weight)
    let matchedSkills = [];
    let skillScore = 0;

    if (teamRequiredSkills.length > 0) {
      // Direct match against required skills
      matchedSkills = candidateSkillsRaw.filter((s) => teamRequiredSkills.includes(normalizeSkill(s)));
      const ratio = matchedSkills.length / teamRequiredSkills.length;
      skillScore = Math.min(70, Math.round(ratio * 70));
    } else {
      // Complementary match: skills that bring new capabilities to the team
      const newSkills = candidateSkillsRaw.filter((s) => !teamCurrentSkills.has(normalizeSkill(s)));
      matchedSkills = newSkills;
      const ratio = Math.min(1.0, candidateSkillsRaw.length > 0 ? candidateSkillsRaw.length / 4 : 0.2);
      skillScore = Math.round(ratio * 70);
    }

    // Timezone Score (30% weight) & Working Hour Overlap
    const candidateTz = candidate.timezone || 'UTC';
    const leaderTz = team.leader?.timezone || 'UTC';
    const candidateOffset = getTimezoneOffsetMinutes(candidateTz);
    const hourDiff = Math.abs(candidateOffset - leaderOffset) / 60;

    // Working-hour overlap percentage based on 9-hour workday
    const overlapHours = Math.max(0, 9 - hourDiff);
    const timezoneOverlapPercent = Math.round((overlapHours / 9) * 100);

    let tzScore = 5;
    if (hourDiff <= 1) tzScore = 30;
    else if (hourDiff <= 3) tzScore = 24;
    else if (hourDiff <= 6) tzScore = 18;
    else if (hourDiff <= 9) tzScore = 12;
    else if (hourDiff <= 12) tzScore = 8;

    const totalScore = Math.min(100, Math.round(skillScore + tzScore));

    // Phase 7: Clear human-readable explanation with explicit heuristic disclaimer
    const skillExplanation =
      teamRequiredSkills.length > 0
        ? matchedSkills.length > 0
          ? `provides the matching skills (${matchedSkills.join(', ')})`
          : `provides complementary skills (${candidateSkillsRaw.slice(0, 3).join(', ') || 'general profile'})`
        : `offers complementary capabilities (${matchedSkills.slice(0, 3).join(', ') || 'general capabilities'})`;

    const explanationText = `Recommended because this candidate ${skillExplanation}, with ${timezoneOverlapPercent}% timezone overlap (${candidateTz} vs ${leaderTz}). Note: Heuristic compatibility estimate based on self-reported skills.`;

    return {
      user: candidate,
      score: totalScore,
      matchScore: totalScore,
      breakdown: {
        skillScore,
        timezoneScore: tzScore,
        totalScore,
        timezoneOverlapPercent,
      },
      matchedSkills,
      hourDifference: hourDiff,
      explanation: {
        text: explanationText,
        matchingSkills: matchedSkills,
        timezoneProximity: `${hourDiff.toFixed(1)}h difference (${timezoneOverlapPercent}% working overlap)`,
        skillExplanation,
      },
    };
  });

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  return scoredCandidates.slice(0, limit);
};
