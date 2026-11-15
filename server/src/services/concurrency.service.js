import prisma from '../config/database.js';
import { AppError } from '../middleware/error.middleware.js';
import { createAuditLog } from './audit.service.js';
import { eventEmitter, DOMAIN_EVENTS } from '../events/eventEmitter.js';
import { hashSecureToken } from '../utils/crypto.js';

/**
 * Concurrency-Safe Join Request Acceptance Engine
 * Utilizes PostgreSQL SELECT ... FOR UPDATE pessimistic row-locking on the Team table
 * to ensure that exactly N members can fill a team with capacity N, preventing oversubscription.
 * 
 * Supports safe idempotent retries:
 * If a request is already accepted and the user is a member of the team, returns a consistent 200 OK.
 */
export const acceptJoinRequestWithLock = async (requestId, leaderId) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Initial read to identify the team
    const initialRequest = await tx.joinRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!initialRequest) {
      throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    }

    const { teamId, userId } = initialRequest;

    // 2. CRITICAL CONCURRENCY LOCK:
    // Lock the Team row for update. Any other transaction attempting to mutate or check this team
    // will block here until this transaction commits or rolls back.
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "hackathonId", "leaderId", "minSize", "maxSize", status 
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

    // 3. RE-FETCH and validate the join request INSIDE the locked transaction!
    const lockedRequest = await tx.joinRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!lockedRequest) {
      throw new AppError('Join request not found', 404, 'REQUEST_NOT_FOUND');
    }

    // 4. IDEMPOTENT HANDLING:
    // If request has already been accepted, check if user is already a member
    if (lockedRequest.status === 'ACCEPTED') {
      const existingTeamMember = await tx.teamMember.findFirst({
        where: { teamId, userId },
        include: {
          user: {
            select: { id: true, name: true, email: true, skills: true },
          },
        },
      });

      if (existingTeamMember) {
        const countRes = await tx.$queryRaw`
          SELECT COUNT(*)::int AS count 
          FROM "TeamMember" 
          WHERE "teamId" = ${teamId}
        `;
        const count = countRes[0]?.count || 0;

        return {
          member: existingTeamMember,
          request: lockedRequest,
          teamId,
          memberCount: count,
          isFull: count >= team.maxSize,
          hackathonId: team.hackathonId,
          idempotent: true,
        };
      }
    }

    if (lockedRequest.status !== 'PENDING') {
      throw new AppError(
        `Request has already been ${lockedRequest.status.toLowerCase()}`,
        409,
        `REQUEST_${lockedRequest.status}`
      );
    }

    // 5. Count current memberships inside the locked transaction
    const memberCountResult = await tx.$queryRaw`
      SELECT COUNT(*)::int AS count 
      FROM "TeamMember" 
      WHERE "teamId" = ${teamId}
    `;

    const currentCount = memberCountResult[0]?.count || 0;

    // 6. Invariant Check: Capacity enforcement
    if (currentCount >= team.maxSize) {
      throw new AppError(
        `Team has reached its maximum capacity of ${team.maxSize} members. No available seats.`,
        409,
        'TEAM_FULL'
      );
    }

    // 7. Invariant Check: User already in another team in this hackathon
    const existingMembership = await tx.$queryRaw`
      SELECT id, "teamId" 
      FROM "TeamMember" 
      WHERE "hackathonId" = ${team.hackathonId} AND "userId" = ${userId}
    `;

    if (existingMembership && existingMembership.length > 0) {
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

    // 8. Create TeamMember record
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

    // 9. Update JoinRequest status to ACCEPTED
    const updatedRequest = await tx.joinRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    });

    // 10. If team now reaches maxSize, update Team status to FULL
    const newCount = currentCount + 1;
    if (newCount >= team.maxSize) {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'FULL' },
      });
    }

    // 11. Record immutable AuditLog
    await createAuditLog(tx, {
      actorId: leaderId,
      teamId,
      action: 'REQUEST_ACCEPTED',
      metadata: {
        requestId,
        newMemberId: userId,
        newMemberName: lockedRequest.user.name,
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
      idempotent: false,
    };
  }).then((result) => {
    // Only emit events if not an idempotent duplicate
    if (!result.idempotent) {
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
    }

    return result;
  });
};

/**
 * Concurrency-Safe Invitation Acceptance Engine
 * Uses consistent locking order to guarantee single-use under concurrency:
 * 1. Read invitation to discover its team.
 * 2. Lock the team row.
 * 3. Lock and re-read the invitation row inside the same transaction.
 * 4. Revalidate usedAt and expiresAt.
 * 5. Check membership uniqueness and team capacity.
 * 6. Create membership.
 * 7. Mark invitation as used.
 * 8. Create audit log.
 * 9. Commit.
 */
export const acceptInviteWithLock = async (token, userId) => {
  const tokenHash = hashSecureToken(token);

  return await prisma.$transaction(async (tx) => {
    // 1. Read the invitation to discover its team
    const initialInvite = await tx.invite.findUnique({
      where: { tokenHash },
    });

    if (!initialInvite) {
      throw new AppError('Invalid invitation link', 404, 'INVITE_NOT_FOUND');
    }

    const { teamId } = initialInvite;

    // 2. Lock the team row
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "hackathonId", "minSize", "maxSize", status 
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

    // 3. Lock and re-read the invitation row inside the same transaction
    const lockedInvites = await tx.$queryRaw`
      SELECT id, "teamId", "tokenHash", "expiresAt", "usedAt" 
      FROM "Invite" 
      WHERE id = ${initialInvite.id} 
      FOR UPDATE
    `;

    if (!lockedInvites || lockedInvites.length === 0) {
      throw new AppError('Invitation not found', 404, 'INVITE_NOT_FOUND');
    }

    const invite = lockedInvites[0];

    // 4. Revalidate usedAt and expiresAt
    if (invite.usedAt) {
      throw new AppError('This invitation has already been used', 409, 'INVITE_ALREADY_USED');
    }

    if (new Date() > new Date(invite.expiresAt)) {
      throw new AppError('This invitation has expired', 410, 'INVITE_EXPIRED');
    }

    // 5. Check membership uniqueness and team capacity
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

    // 6. Create membership
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

    // 7. Mark invitation as used (prevent reuse)
    await tx.$executeRaw`
      UPDATE "Invite" 
      SET "usedAt" = NOW() 
      WHERE id = ${invite.id}
    `;

    // If capacity reached, mark team as FULL
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
      metadata: { inviteId: invite.id, newCount, maxSize: team.maxSize },
    });

    // 9. Commit (implicit on transaction completion)
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
    eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, {
      teamId: result.teamId,
      memberCount: result.memberCount,
      isFull: result.isFull,
    });
    return result;
  });
};

/**
 * Concurrency-Safe Member Self-Leaving Engine with Automatic Leadership Succession & Team Deletion
 * 
 * Required Behavior:
 * - When the leader leaves and other members exist:
 *   - Automatically promotes the oldest remaining member (deterministic ordering by joinedAt asc, then id asc).
 *   - Updates Team.leaderId.
 *   - Changes previous leader's membership role to MEMBER.
 *   - Changes new leader's role to LEADER.
 *   - Removes previous leader's membership.
 *   - Records leadership transfer and departure in audit logs.
 *   - Emits appropriate SSE events.
 * 
 * - If the departing person is the last member:
 *   - Deletes the team.
 *   - Preserves the audit record of team deletion.
 *   - Ensures related memberships, requests and invitations are handled correctly.
 * 
 * All operations execute in one PostgreSQL transaction.
 */
export const leaveTeamWithLock = async (teamId, userId) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Lock team row
    const lockedTeams = await tx.$queryRaw`
      SELECT id, "name", "leaderId", "hackathonId", "minSize", "maxSize", status 
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

    // 3. Find remaining members excluding departing user, ordered deterministically by joinedAt asc, then id asc
    const remainingMembers = await tx.teamMember.findMany({
      where: { teamId, userId: { not: userId } },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    const isLeader = team.leaderId === userId;

    // CASE A: Departing user is the LAST member -> DELETE TEAM
    if (remainingMembers.length === 0) {
      // 1. Create audit log of deletion BEFORE deleting the team (preserving record)
      await createAuditLog(tx, {
        actorId: userId,
        teamId: null, // preserved without dangling foreign key
        action: 'TEAM_DELETED',
        metadata: {
          teamId,
          teamName: team.name,
          hackathonId: team.hackathonId,
          reason: 'Last member left the team',
          departingUserId: userId,
        },
      });

      // 2. Clean up memberships, requests, and invites
      await tx.teamMember.deleteMany({ where: { teamId } });
      await tx.joinRequest.deleteMany({ where: { teamId } });
      await tx.invite.deleteMany({ where: { teamId } });

      // 3. Delete the Team row
      await tx.team.delete({ where: { id: teamId } });

      return {
        teamId,
        teamName: team.name,
        hackathonId: team.hackathonId,
        deleted: true,
        disbanded: true,
        memberCount: 0,
        leadershipTransferred: false,
      };
    }

    // CASE B: Leader leaving and other members exist -> AUTOMATIC SUCCESSION
    if (isLeader) {
      const successor = remainingMembers[0];
      const newLeaderId = successor.userId;
      const newLeaderUser = successor.user;

      // 1. Update Team.leaderId
      await tx.team.update({
        where: { id: teamId },
        data: { leaderId: newLeaderId },
      });

      // 2. Change previous leader's membership role to MEMBER
      await tx.teamMember.update({
        where: { id: membership.id },
        data: { role: 'MEMBER' },
      });

      // 3. Change new leader's role to LEADER
      await tx.teamMember.update({
        where: { id: successor.id },
        data: { role: 'LEADER' },
      });

      // 4. Remove previous leader's membership
      await tx.teamMember.delete({
        where: { id: membership.id },
      });

      const newCount = remainingMembers.length;

      // If team was FULL, revert status to ACTIVE
      if (team.status === 'FULL' && newCount < team.maxSize) {
        await tx.team.update({
          where: { id: teamId },
          data: { status: 'ACTIVE' },
        });
      }

      // 5. Record leadership transfer audit log
      await createAuditLog(tx, {
        actorId: userId,
        teamId,
        action: 'LEADERSHIP_TRANSFERRED',
        metadata: {
          previousLeaderId: userId,
          newLeaderId,
          newLeaderName: newLeaderUser.name,
          reason: 'Automatic succession upon leader departure',
        },
      });

      // 6. Record member departure audit log
      await createAuditLog(tx, {
        actorId: userId,
        teamId,
        action: 'MEMBER_LEFT',
        metadata: {
          userId,
          wasLeader: true,
          successorLeaderId: newLeaderId,
          remainingMembersCount: newCount,
        },
      });

      return {
        teamId,
        teamName: team.name,
        hackathonId: team.hackathonId,
        deleted: false,
        disbanded: false,
        memberCount: newCount,
        leadershipTransferred: true,
        previousLeaderId: userId,
        newLeaderId,
        newLeaderUser,
      };
    }

    // CASE C: Regular member leaving
    await tx.teamMember.delete({ where: { id: membership.id } });

    const newCount = remainingMembers.length;
    if (team.status === 'FULL' && newCount < team.maxSize) {
      await tx.team.update({
        where: { id: teamId },
        data: { status: 'ACTIVE' },
      });
    }

    await createAuditLog(tx, {
      actorId: userId,
      teamId,
      action: 'MEMBER_LEFT',
      metadata: { userId, remainingMembersCount: newCount },
    });

    return {
      teamId,
      teamName: team.name,
      hackathonId: team.hackathonId,
      deleted: false,
      disbanded: false,
      memberCount: newCount,
      leadershipTransferred: false,
    };
  }).then((result) => {
    if (result.deleted) {
      eventEmitter.emit(DOMAIN_EVENTS.TEAM_DISBANDED, {
        teamId: result.teamId,
        hackathonId: result.hackathonId,
        deleted: true,
      });
    } else {
      if (result.leadershipTransferred) {
        eventEmitter.emit(DOMAIN_EVENTS.LEADERSHIP_TRANSFERRED, {
          teamId: result.teamId,
          previousLeaderId: result.previousLeaderId,
          newLeaderId: result.newLeaderId,
          newLeaderUser: result.newLeaderUser,
        });
      }
      eventEmitter.emit(DOMAIN_EVENTS.MEMBER_LEFT, {
        teamId: result.teamId,
        userId,
        memberCount: result.memberCount,
      });
      eventEmitter.emit(DOMAIN_EVENTS.TEAM_UPDATED, {
        teamId: result.teamId,
        memberCount: result.memberCount,
        isFull: false,
        leaderId: result.newLeaderId || undefined,
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
      SELECT id, "name", "leaderId", "hackathonId", "minSize", "maxSize", status 
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
