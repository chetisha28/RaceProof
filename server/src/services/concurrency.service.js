import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { createAuditLog } from './audit.service.js';
import { eventEmitter, DOMAIN_EVENTS } from '../events/eventEmitter.js';
import { hashSecureToken } from '../utils/crypto.js';

/**
 * Concurrency-Safe Join Request Acceptance Engine
 * Utilizes PostgreSQL SELECT ... FOR UPDATE pessimistic row-locking on the Team table
 * to ensure that exactly N members can fill a team with capacity N, preventing oversubscription.
 */
export const acceptJoinRequestWithLock = async (requestId, leaderId) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch the join request within the transaction
    const request = await tx.joinRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    }

    if (request.status !== 'PENDING') {
      throw new AppError(`Request has already been ${request.status.toLowerCase()}`, 400, 'REQUEST_NOT_PENDING');
    }

    const { teamId, userId } = request;

    // 2. CRITICAL CONCURRENCY LOCK:
    // Lock the Team row for update. Any other transaction attempting to mutate or check this team
    // will block here until this transaction commits or rolls back.
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "hackathonId", "leaderId", "maxSize", status 
      FROM "Team" 
      WHERE id = ${teamId} 
      FOR UPDATE
    `;

    if (!lockedTeams || lockedTeams.length === 0) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const team = lockedTeams[0];

    if (team.status === 'DISBANDED') {
      throw new AppError('Cannot accept members into a disbanded team', 400, 'TEAM_DISBANDED');
    }

    if (team.leaderId !== leaderId) {
      throw new AppError('Only the team leader can accept join requests', 403, 'FORBIDDEN_NOT_LEADER');
    }

    // 3. Count current memberships inside the locked transaction
    const memberCountResult = await tx.$queryRaw`
      SELECT COUNT(*)::int AS count 
      FROM "TeamMember" 
      WHERE "teamId" = ${teamId}
    `;

    const currentCount = memberCountResult[0]?.count || 0;

    // 4. Invariant Check: Capacity enforcement
    if (currentCount >= team.maxSize) {
      // Team is full: mark request as DECLINED or leave for leader, throw 409 Conflict
      throw new AppError(
        `Team has reached its maximum capacity of ${team.maxSize} members. No available seats.`,
        409,
        'TEAM_FULL'
      );
    }

    // 5. Invariant Check: User already in another team in this hackathon
    const existingMembership = await tx.$queryRaw`
      SELECT id, "teamId" 
      FROM "TeamMember" 
      WHERE "hackathonId" = ${team.hackathonId} AND "userId" = ${userId}
    `;

    if (existingMembership && existingMembership.length > 0) {
      // Update this request to CANCELLED since user already found a team
      await tx.joinRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' },
      });

      throw new AppError(
        'User is already a member of a team in this hackathon',
        409,
        'ALREADY_IN_TEAM'
      );
    }

    // 6. Create TeamMember record
    const newMember = await tx.teamMember.create({
      data: {
        teamId,
        hackathonId: team.hackathonId,
        userId,
        role: 'MEMBER',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, skills: true },
        },
      },
    });

    // 7. Update JoinRequest status to ACCEPTED
    const updatedRequest = await tx.joinRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    });

    // 8. If team now reaches maxSize, update Team status to FULL
    const newCount = currentCount + 1;
    if (newCount >= team.maxSize) {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'FULL' },
      });
    }

    // 9. Record immutable AuditLog
    await createAuditLog(tx, {
      actorId: leaderId,
      teamId,
      action: 'REQUEST_ACCEPTED',
      metadata: {
        requestId,
        newMemberId: userId,
        newMemberName: request.user.name,
        newCount,
        maxSize: team.maxSize,
      },
    });

    return {
      member: newMember,
      request: updatedRequest,
      teamId,
      memberCount: newCount,
      isFull: newCount >= team.maxSize,
      hackathonId: team.hackathonId,
    };
  }).then((result) => {
    // Emit real-time SSE events outside transaction boundary
    eventEmitter.emit(DOMAIN_EVENTS.REQUEST_ACCEPTED, {
      requestId,
      teamId: result.teamId,
      userId: result.member.userId,
      memberCount: result.memberCount,
      isFull: result.isFull,
    });

    eventEmitter.emit(DOMAIN_EVENTS.MEMBER_JOINED, {
      teamId: result.teamId,
      user: result.member.user,
      memberCount: result.memberCount,
      isFull: result.isFull,
    });

    eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, {
      teamId: result.teamId,
      memberCount: result.memberCount,
      isFull: result.isFull,
    });

    return result;
  });
};

/**
 * Concurrency-Safe Invitation Acceptance Engine
 */
export const acceptInviteWithLock = async (token, userId) => {
  const tokenHash = hashSecureToken(token);

  return await prisma.$transaction(async (tx) => {
    // 1. Find invite record
    const invite = await tx.invite.findUnique({
      where: { tokenHash },
    });

    if (!invite) {
      throw new AppError('Invalid invitation link', 404, 'INVITE_NOT_FOUND');
    }

    if (invite.usedAt) {
      throw new AppError('This invitation has already been used', 409, 'INVITE_ALREADY_USED');
    }

    if (new Date() > new Date(invite.expiresAt)) {
      throw new AppError('This invitation has expired', 410, 'INVITE_EXPIRED');
    }

    const { teamId } = invite;

    // 2. Row-lock the Team record
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "hackathonId", "maxSize", status 
      FROM "Team" 
      WHERE id = ${teamId} 
      FOR UPDATE
    `;

    if (!lockedTeams || lockedTeams.length === 0) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const team = lockedTeams[0];

    if (team.status === 'DISBANDED') {
      throw new AppError('Cannot join a disbanded team', 400, 'TEAM_DISBANDED');
    }

    // 3. Check capacity
    const memberCountResult = await tx.$queryRaw`
      SELECT COUNT(*)::int AS count 
      FROM "TeamMember" 
      WHERE "teamId" = ${teamId}
    `;

    const currentCount = memberCountResult[0]?.count || 0;

    if (currentCount >= team.maxSize) {
      throw new AppError(
        `Team has reached its maximum capacity of ${team.maxSize} members`,
        409,
        'TEAM_FULL'
      );
    }

    // 4. Verify user is not already in a team in this hackathon
    const existingMembership = await tx.$queryRaw`
      SELECT id, "teamId" 
      FROM "TeamMember" 
      WHERE "hackathonId" = ${team.hackathonId} AND "userId" = ${userId}
    `;

    if (existingMembership && existingMembership.length > 0) {
      throw new AppError(
        'You are already a member of a team in this hackathon',
        409,
        'ALREADY_IN_TEAM'
      );
    }

    // 5. Create membership
    const member = await tx.teamMember.create({
      data: {
        teamId,
        hackathonId: team.hackathonId,
        userId,
        role: 'MEMBER',
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, skills: true },
        },
      },
    });

    // 6. Mark invite as used (prevent reuse)
    await tx.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    // 7. If capacity reached, mark team as FULL
    const newCount = currentCount + 1;
    if (newCount >= team.maxSize) {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'FULL' },
      });
    }

    // 8. Create AuditLog
    await createAuditLog(tx, {
      actorId: userId,
      teamId,
      action: 'INVITE_ACCEPTED',
      metadata: { inviteId: invite.id, newCount },
    });

    return {
      member,
      teamId,
      hackathonId: team.hackathonId,
      memberCount: newCount,
      isFull: newCount >= team.maxSize,
    };
  }).then((result) => {
    eventEmitter.emit(DOMAIN_EVENTS.MEMBER_JOINED, {
      teamId: result.teamId,
      user: result.member.user,
      memberCount: result.memberCount,
      isFull: result.isFull,
    });
    return result;
  });
};

/**
 * Concurrency-Safe Member Self-Leaving Engine
 */
export const leaveTeamWithLock = async (teamId, userId) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock team row
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "leaderId", "hackathonId", "maxSize", status 
      FROM "Team" 
      WHERE id = ${teamId} 
      FOR UPDATE
    `;

    if (!lockedTeams || lockedTeams.length === 0) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const team = lockedTeams[0];

    // 2. Check if user is a member
    const membership = await tx.teamMember.findFirst({
      where: { teamId, userId },
    });

    if (!membership) {
      throw new AppError('You are not a member of this team', 400, 'NOT_A_MEMBER');
    }

    // 3. Count total members
    const countResult = await tx.$queryRaw`
      SELECT COUNT(*)::int AS count 
      FROM "TeamMember" 
      WHERE "teamId" = ${teamId}
    `;
    const memberCount = countResult[0]?.count || 0;

    // 4. If user is the leader
    if (team.leaderId === userId) {
      if (memberCount > 1) {
        throw new AppError(
          'Team leader cannot leave without transferring leadership to another member first',
          400,
          'LEADER_CANNOT_LEAVE_WITH_MEMBERS'
        );
      } else {
        // Leader is the sole member: leaving disbands the team
        await tx.teamMember.delete({ where: { id: membership.id } });
        await tx.team.update({
          where: { id: teamId },
          data: { status: 'DISBANDED' },
        });

        await createAuditLog(tx, {
          actorId: userId,
          teamId,
          action: 'TEAM_DISBANDED',
          metadata: { reason: 'Sole leader left the team' },
        });

        return { teamId, disbanded: true, memberCount: 0 };
      }
    }

    // 5. Regular member leaving
    await tx.teamMember.delete({ where: { id: membership.id } });

    // If team status was FULL, revert to ACTIVE
    if (team.status === 'FULL') {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'ACTIVE' },
      });
    }

    await createAuditLog(tx, {
      actorId: userId,
      teamId,
      action: 'MEMBER_LEFT',
      metadata: { userId },
    });

    const newCount = memberCount - 1;
    return { teamId, disbanded: false, memberCount: newCount };
  }).then((result) => {
    if (result.disbanded) {
      eventEmitter.emit(DOMAIN_EVENTS.TEAM_DISBANDED, { teamId: result.teamId });
    } else {
      eventEmitter.emit(DOMAIN_EVENTS.MEMBER_LEFT, {
        teamId: result.teamId,
        userId,
        memberCount: result.memberCount,
      });
      eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, {
        teamId: result.teamId,
        memberCount: result.memberCount,
        isFull: false,
      });
    }
    return result;
  });
};

/**
 * Concurrency-Safe Member Removal by Leader
 */
export const removeMemberWithLock = async (teamId, targetUserId, leaderId) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock team row
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "leaderId", "hackathonId", status 
      FROM "Team" 
      WHERE id = ${teamId} 
      FOR UPDATE
    `;

    if (!lockedTeams || lockedTeams.length === 0) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const team = lockedTeams[0];

    if (team.leaderId !== leaderId) {
      throw new AppError('Only the team leader can remove members', 403, 'FORBIDDEN_NOT_LEADER');
    }

    if (targetUserId === leaderId) {
      throw new AppError('Leader cannot remove themselves. Use leave or disband.', 400, 'CANNOT_REMOVE_LEADER');
    }

    const membership = await tx.teamMember.findFirst({
      where: { teamId, userId: targetUserId },
      include: { user: { select: { name: true } } },
    });

    if (!membership) {
      throw new AppError('Target user is not a member of this team', 404, 'MEMBER_NOT_FOUND');
    }

    await tx.teamMember.delete({ where: { id: membership.id } });

    // If team status was FULL, revert to ACTIVE
    if (team.status === 'FULL') {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'ACTIVE' },
      });
    }

    const countResult = await tx.$queryRaw`
      SELECT COUNT(*)::int AS count 
      FROM "TeamMember" 
      WHERE "teamId" = ${teamId}
    `;
    const newCount = countResult[0]?.count || 0;

    await createAuditLog(tx, {
      actorId: leaderId,
      teamId,
      action: 'MEMBER_REMOVED',
      metadata: { removedUserId: targetUserId, removedUserName: membership.user.name, newCount },
    });

    return { teamId, removedUserId: targetUserId, memberCount: newCount };
  }).then((result) => {
    eventEmitter.emit(DOMAIN_EVENTS.MEMBER_LEFT, {
      teamId: result.teamId,
      userId: result.removedUserId,
      memberCount: result.memberCount,
    });
    eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, {
      teamId: result.teamId,
      memberCount: result.memberCount,
      isFull: false,
    });
    return result;
  });
};

/**
 * Concurrency-Safe Leadership Transfer Engine
 */
export const transferLeadershipWithLock = async (teamId, currentLeaderId, newLeaderId) => {
  return await prisma.$transaction(async (tx) => {
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "leaderId", "hackathonId", status 
      FROM "Team" 
      WHERE id = ${teamId} 
      FOR UPDATE
    `;

    if (!lockedTeams || lockedTeams.length === 0) {
      throw new AppError('Team not found', 404, 'TEAM_NOT_FOUND');
    }

    const team = lockedTeams[0];

    if (team.leaderId !== currentLeaderId) {
      throw new AppError('Only the current team leader can transfer leadership', 403, 'FORBIDDEN_NOT_LEADER');
    }

    if (currentLeaderId === newLeaderId) {
      throw new AppError('Cannot transfer leadership to yourself', 400, 'CANNOT_TRANSFER_TO_SELF');
    }

    // Verify new leader is currently in the team
    const newLeaderMembership = await tx.teamMember.findFirst({
      where: { teamId, userId: newLeaderId },
      include: { user: { select: { id: true, name: true } } },
    });

    if (!newLeaderMembership) {
      throw new AppError('The designated new leader is not a member of this team', 400, 'NEW_LEADER_NOT_MEMBER');
    }

    // Update Team leaderId
    await tx.team.update({
      where: { id: teamId },
      data: { leaderId: newLeaderId },
    });

    // Update old leader role to MEMBER
    await tx.teamMember.updateMany({
      where: { teamId, userId: currentLeaderId },
      data: { role: 'MEMBER' },
    });

    // Update new leader role to LEADER
    await tx.teamMember.update({
      where: { id: newLeaderMembership.id },
      data: { role: 'LEADER' },
    });

    await createAuditLog(tx, {
      actorId: currentLeaderId,
      teamId,
      action: 'LEADERSHIP_TRANSFERRED',
      metadata: {
        previousLeaderId: currentLeaderId,
        newLeaderId,
        newLeaderName: newLeaderMembership.user.name,
      },
    });

    return {
      teamId,
      previousLeaderId: currentLeaderId,
      newLeaderId,
    };
  }).then((result) => {
    eventEmitter.emit(DOMAIN_EVENTS.LEADERSHIP_TRANSFERRED, result);
    eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, { teamId: result.teamId });
    return result;
  });
};

