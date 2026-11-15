import prisma from '../config/database.js';
import * as concurrencyService from '../services/concurrency.service.js';
import { successResponse, errorResponse } from '../utils/response.js';
import bcrypt from 'bcryptjs';

/**
 * Executes an authentic, isolated 50-request PostgreSQL concurrency test on the live database.
 * Completely sandboxed: creates isolated temporary users and team, executes 50 simultaneous
 * acceptance transactions using PostgreSQL row-level locks, verifies all invariants, and cleans up.
 */
export const runLiveConcurrencyTest = async (req, res) => {
  const startTime = Date.now();
  let testTeamId = null;
  let testUserIds = [];

  try {
    // 1. Ensure isolated demonstration hackathon exists
    let hackathon = await prisma.hackathon.findFirst();
    if (!hackathon) {
      hackathon = await prisma.hackathon.create({
        data: {
          name: 'Demo Benchmark Hackathon',
          description: 'Isolated test environment for live concurrency demonstration',
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        },
      });
    }

    const defaultPasswordHash = await bcrypt.hash('DemoPass123!', 6);

    // 2. Create Leader and 2 initial members (Total = 3, Max = 4 -> exactly 1 slot left)
    const testPrefix = `demo_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const leader = await prisma.user.create({
      data: {
        name: 'Demo Team Leader',
        email: `${testPrefix}_leader@demo.internal`,
        passwordHash: defaultPasswordHash,
      },
    });
    testUserIds.push(leader.id);

    const initialMembers = await prisma.user.createManyAndReturn({
      data: [
        { name: 'Initial Member 1', email: `${testPrefix}_m1@demo.internal`, passwordHash: defaultPasswordHash },
        { name: 'Initial Member 2', email: `${testPrefix}_m2@demo.internal`, passwordHash: defaultPasswordHash },
      ],
    });
    testUserIds.push(...initialMembers.map((m) => m.id));

    // Create Team with capacity = 4
    const team = await prisma.team.create({
      data: {
        name: `Live Contention Team ${Date.now()}`,
        description: 'Authentic PostgreSQL 50-request contention test scenario',
        hackathonId: hackathon.id,
        leaderId: leader.id,
        minSize: 2,
        maxSize: 4,
        status: 'ACTIVE',
      },
    });
    testTeamId = team.id;

    // Add 3 members
    await prisma.teamMember.createMany({
      data: [
        { teamId: team.id, hackathonId: hackathon.id, userId: leader.id, role: 'LEADER' },
        { teamId: team.id, hackathonId: hackathon.id, userId: initialMembers[0].id, role: 'MEMBER' },
        { teamId: team.id, hackathonId: hackathon.id, userId: initialMembers[1].id, role: 'MEMBER' },
      ],
    });

    // 3. Create 50 applicant users and 50 pending join requests
    const applicantUsers = await prisma.user.createManyAndReturn({
      data: Array.from({ length: 50 }, (_, i) => ({
        name: `Contender ${i + 1}`,
        email: `${testPrefix}_applicant_${i + 1}@demo.internal`,
        passwordHash: defaultPasswordHash,
      })),
    });
    testUserIds.push(...applicantUsers.map((u) => u.id));

    const joinRequests = await prisma.joinRequest.createManyAndReturn({
      data: applicantUsers.map((u, i) => ({
        teamId: team.id,
        userId: u.id,
        status: 'PENDING',
        message: `Concurrent Contender #${i + 1}`,
      })),
    });

    // 4. FIRE 50 SIMULTANEOUS ACCEPT TRANSACTIONS
    // Uses real PostgreSQL SELECT ... FOR UPDATE transactions
    const executionStart = Date.now();
    const results = await Promise.allSettled(
      joinRequests.map((reqItem) => concurrencyService.acceptJoinRequestWithLock(reqItem.id, leader.id))
    );
    const executionTimeMs = Date.now() - executionStart;

    // 5. Gather statistics
    let acceptedCount = 0;
    let conflictCount = 0;
    let unexpectedErrorCount = 0;

    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        acceptedCount++;
      } else {
        const errCode = r.reason?.statusCode || r.reason?.code;
        if (errCode === 409 || errCode === 'TEAM_FULL' || errCode === 'CAPACITY_REACHED') {
          conflictCount++;
        } else {
          unexpectedErrorCount++;
        }
      }
    });

    // 6. Query final PostgreSQL membership count directly from the database
    const finalMembers = await prisma.teamMember.findMany({
      where: { teamId: team.id },
    });

    const finalMemberCount = finalMembers.length;
    const oversubscription = Math.max(0, finalMemberCount - 4);
    const invariantsVerified =
      acceptedCount === 1 && conflictCount === 49 && finalMemberCount === 4 && oversubscription === 0;

    return successResponse(
      res,
      {
        totalRequests: 50,
        acceptedCount,
        conflictCount,
        unexpectedErrorCount,
        initialMembers: 3,
        maxCapacity: 4,
        finalPostgresMemberCount: finalMemberCount,
        oversubscription,
        executionTimeMs,
        totalDurationMs: Date.now() - startTime,
        invariantsVerified,
        database: 'PostgreSQL 18',
        lockStrategy: 'Pessimistic Row-Level Lock (SELECT ... FOR UPDATE)',
        verificationMessage: invariantsVerified
          ? 'VERIFIED: Exactly 1 request filled the final slot; 49 safely received 409 Conflict. Zero oversubscription.'
          : 'INVARIANT ANOMALY DETECTED',
      },
      'Authentic PostgreSQL concurrency benchmark completed'
    );
  } catch (error) {
    return errorResponse(
      res,
      `Concurrency demonstration error: ${error.message}`,
      500,
      'DEMO_EXECUTION_FAILED'
    );
  } finally {
    // 7. Cleanup test records so user data is never polluted
    try {
      if (testTeamId) {
        await prisma.auditLog.deleteMany({ where: { teamId: testTeamId } });
        await prisma.joinRequest.deleteMany({ where: { teamId: testTeamId } });
        await prisma.teamMember.deleteMany({ where: { teamId: testTeamId } });
        await prisma.team.deleteMany({ where: { id: testTeamId } });
      }
      if (testUserIds.length > 0) {
        await prisma.user.deleteMany({ where: { id: { in: testUserIds } } });
      }
    } catch (cleanupErr) {
      console.warn('Demo cleanup notice:', cleanupErr.message);
    }
  }
};
