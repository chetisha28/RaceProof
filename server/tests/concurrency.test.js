import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/database.js';
import { cleanDatabase, disconnectDatabase } from './setup.js';
import bcrypt from 'bcryptjs';

describe('CRITICAL: High-Concurrency Team Capacity Verification', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('24. should guarantee that exactly 1 of 50 concurrent requests fills a team with 1 slot remaining', async () => {
    console.log('\n--- 🚀 Starting High-Concurrency Contention Test (50 Concurrent Accepts) ---');

    // 1. Create Hackathon
    const hackathon = await prisma.hackathon.create({
      data: {
        name: 'Concurrency Stress Hackathon 2026',
        description: 'Testing race conditions under 50 simultaneous join requests',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 3),
      },
    });

    const defaultPasswordHash = await bcrypt.hash('Password123!', 6);

    // 2. Create Team Leader
    const leaderUser = await prisma.user.create({
      data: {
        name: 'Leader User',
        email: 'concurrency_leader@test.com',
        passwordHash: defaultPasswordHash,
      },
    });

    // Login Leader to obtain auth token
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'concurrency_leader@test.com', password: 'Password123!' });
    const leaderToken = leaderLogin.body.data.token;

    // 3. Create Team with maximum size 4
    const team = await prisma.team.create({
      data: {
        name: 'Concurrency Fortress',
        description: 'Capacity: 4. Current: 3. Remaining: 1.',
        hackathonId: hackathon.id,
        leaderId: leaderUser.id,
        maxSize: 4,
        status: 'ACTIVE',
      },
    });

    // 4. Create 2 additional existing members (Total current members = 3: Leader + 2)
    const existingMemberUsers = await prisma.user.createManyAndReturn({
      data: [
        {
          name: 'Existing Member 1',
          email: 'existing1@test.com',
          passwordHash: defaultPasswordHash,
        },
        {
          name: 'Existing Member 2',
          email: 'existing2@test.com',
          passwordHash: defaultPasswordHash,
        },
      ],
    });

    await prisma.teamMember.createMany({
      data: [
        {
          teamId: team.id,
          hackathonId: hackathon.id,
          userId: leaderUser.id,
          role: 'LEADER',
        },
        {
          teamId: team.id,
          hackathonId: hackathon.id,
          userId: existingMemberUsers[0].id,
          role: 'MEMBER',
        },
        {
          teamId: team.id,
          hackathonId: hackathon.id,
          userId: existingMemberUsers[1].id,
          role: 'MEMBER',
        },
      ],
    });

    // Verify initial count is exactly 3
    const initialCount = await prisma.teamMember.count({ where: { teamId: team.id } });
    expect(initialCount).toBe(3);
    console.log(`Initial state: Team "${team.name}" has ${initialCount}/${team.maxSize} members. 1 slot available.`);

    // 5. Create 50 distinct registered applicants
    console.log('Generating 50 applicant users in PostgreSQL...');
    const applicantData = Array.from({ length: 50 }, (_, i) => ({
      name: `Applicant ${i + 1}`,
      email: `applicant_${i + 1}@raceproof.dev`,
      passwordHash: defaultPasswordHash,
      skills: ['Concurrency', 'SQL', 'Testing'],
    }));

    const applicants = await prisma.user.createManyAndReturn({
      data: applicantData,
    });
    expect(applicants).toHaveLength(50);

    // 6. Create 50 valid PENDING join requests
    console.log('Generating 50 pending join requests...');
    const requestData = applicants.map((applicant, i) => ({
      teamId: team.id,
      userId: applicant.id,
      status: 'PENDING',
      message: `Simultaneous applicant #${i + 1}`,
    }));

    const joinRequests = await prisma.joinRequest.createManyAndReturn({
      data: requestData,
    });
    expect(joinRequests).toHaveLength(50);
    console.log(`Created ${joinRequests.length} pending join requests.`);

    // 7. Fire 50 concurrent requests simultaneously using Promise.all
    console.log('🔥 Firing 50 simultaneous acceptance requests to the API...');
    const startTime = Date.now();

    const acceptPromises = joinRequests.map((reqItem) =>
      request(app)
        .patch(`/api/requests/${reqItem.id}/accept`)
        .set('Authorization', `Bearer ${leaderToken}`)
    );

    const responses = await Promise.all(acceptPromises);
    const duration = Date.now() - startTime;
    console.log(`⚡ All 50 concurrent requests completed in ${duration}ms.`);

    // 8. Analyze Response Codes
    const successfulResponses = responses.filter((r) => r.status === 200);
    const conflictResponses = responses.filter((r) => r.status === 409);
    const otherResponses = responses.filter((r) => r.status !== 200 && r.status !== 409);

    console.log(`Results summary:`);
    console.log(`  - 200 OK (Accepted):  ${successfulResponses.length}`);
    console.log(`  - 409 Conflict:       ${conflictResponses.length}`);
    console.log(`  - Unexpected status:  ${otherResponses.length}`);

    // VERIFICATION 1: Exactly 1 request succeeds
    expect(successfulResponses).toHaveLength(1);
    expect(successfulResponses[0].body.success).toBe(true);
    expect(successfulResponses[0].body.data.memberCount).toBe(4);
    expect(successfulResponses[0].body.data.isFull).toBe(true);

    // VERIFICATION 2: Exactly 49 requests fail with HTTP 409 Conflict (TEAM_FULL)
    expect(conflictResponses).toHaveLength(49);
    conflictResponses.forEach((res) => {
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('TEAM_FULL');
    });

    // VERIFICATION 3: Zero unexpected errors (no 500s, no unhandled exceptions)
    expect(otherResponses).toHaveLength(0);

    // 9. Database Integrity Verifications directly in PostgreSQL
    const finalMembers = await prisma.teamMember.findMany({
      where: { teamId: team.id },
      include: { user: true },
    });

    // VERIFICATION 4: Total membership in PostgreSQL remains exactly 4
    expect(finalMembers).toHaveLength(4);

    // VERIFICATION 5: No duplicate memberships exist
    const memberUserIds = finalMembers.map((m) => m.userId);
    const uniqueUserIds = new Set(memberUserIds);
    expect(uniqueUserIds.size).toBe(4);

    // VERIFICATION 6: Exactly 1 join request was marked ACCEPTED in DB
    const acceptedRequestsCount = await prisma.joinRequest.count({
      where: { teamId: team.id, status: 'ACCEPTED' },
    });
    expect(acceptedRequestsCount).toBe(1);

    // VERIFICATION 7: Remaining 49 join requests remain uncorrupted
    const pendingOrDeclinedCount = await prisma.joinRequest.count({
      where: { teamId: team.id, status: 'PENDING' },
    });
    expect(pendingOrDeclinedCount).toBe(49);

    // VERIFICATION 8: Team status updated to FULL
    const updatedTeam = await prisma.team.findUnique({ where: { id: team.id } });
    expect(updatedTeam.status).toBe('FULL');

    console.log('✅ ALL 8 CONCURRENCY INVARIANTS VERIFIED! Zero oversubscription.');
  });
});

