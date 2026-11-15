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

  it('25. should guarantee that exactly 1 of 2 concurrent users succeeds when using the same single-use invitation', async () => {
    console.log('\n--- 🚀 Starting Concurrent Invitation Token Acceptance Test ---');

    // 1. Create Hackathon & Team with capacity 4 (leader + 2 slots)
    const hackathon = await prisma.hackathon.create({
      data: {
        name: 'Invite Race Hackathon',
        description: 'Testing single-use invite concurrency',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 2),
      },
    });

    const defaultPasswordHash = await bcrypt.hash('Password123!', 6);

    const leader = await prisma.user.create({
      data: { name: 'Invite Leader', email: 'inv_leader@test.com', passwordHash: defaultPasswordHash },
    });

    const team = await prisma.team.create({
      data: {
        name: 'Invite Test Team',
        description: 'Testing concurrent invite acceptance',
        hackathonId: hackathon.id,
        leaderId: leader.id,
        maxSize: 4,
      },
    });

    await prisma.teamMember.create({
      data: { teamId: team.id, hackathonId: hackathon.id, userId: leader.id, role: 'LEADER' },
    });

    // 2. Generate a single-use invite
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inv_leader@test.com', password: 'Password123!' });
    const leaderToken = leaderLogin.body.data.token;

    const inviteRes = await request(app)
      .post(`/api/teams/${team.id}/invites`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ expiresInHours: 24 });

    const rawToken = inviteRes.body.data.token;
    expect(rawToken).toBeDefined();

    // 3. Create two different applicant users
    const userA = await prisma.user.create({
      data: { name: 'User A', email: 'user_a@test.com', passwordHash: defaultPasswordHash },
    });
    const userALogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user_a@test.com', password: 'Password123!' });
    const tokenA = userALogin.body.data.token;

    const userB = await prisma.user.create({
      data: { name: 'User B', email: 'user_b@test.com', passwordHash: defaultPasswordHash },
    });
    const userBLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user_b@test.com', password: 'Password123!' });
    const tokenB = userBLogin.body.data.token;

    // 4. Fire simultaneous acceptance requests with the SAME token
    const [resA, resB] = await Promise.all([
      request(app).post(`/api/invites/${rawToken}/accept`).set('Authorization', `Bearer ${tokenA}`),
      request(app).post(`/api/invites/${rawToken}/accept`).set('Authorization', `Bearer ${tokenB}`),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = resA.status === 200 ? resA : resB;
    const loser = resA.status === 409 ? resA : resB;

    expect(winner.body.success).toBe(true);
    expect(loser.body.code).toBe('INVITE_ALREADY_USED');

    // Verify DB state: total members is 2 (leader + exactly one invitee)
    const finalMembers = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    expect(finalMembers).toHaveLength(2);

    // Verify invite usedAt is set
    const inviteRecord = await prisma.invite.findFirst({ where: { teamId: team.id } });
    expect(inviteRecord.usedAt).not.toBeNull();
  });

  it('26. should handle idempotent join-request acceptance safely on concurrent retries of the same request', async () => {
    console.log('\n--- 🚀 Starting Idempotent Join Request Acceptance Test ---');

    const hackathon = await prisma.hackathon.create({
      data: {
        name: 'Idempotency Hackathon',
        description: 'Testing idempotent request handling',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 2),
      },
    });

    const defaultPasswordHash = await bcrypt.hash('Password123!', 6);

    const leader = await prisma.user.create({
      data: { name: 'Idempotent Leader', email: 'idem_leader@test.com', passwordHash: defaultPasswordHash },
    });
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'idem_leader@test.com', password: 'Password123!' });
    const leaderToken = leaderLogin.body.data.token;

    const team = await prisma.team.create({
      data: {
        name: 'Idempotent Team',
        description: 'Testing idempotent accept retries',
        hackathonId: hackathon.id,
        leaderId: leader.id,
        maxSize: 4,
      },
    });
    await prisma.teamMember.create({
      data: { teamId: team.id, hackathonId: hackathon.id, userId: leader.id, role: 'LEADER' },
    });

    const applicant = await prisma.user.create({
      data: { name: 'Idempotent Applicant', email: 'idem_app@test.com', passwordHash: defaultPasswordHash },
    });

    const joinRequest = await prisma.joinRequest.create({
      data: {
        teamId: team.id,
        userId: applicant.id,
        status: 'PENDING',
        message: 'Testing idempotency',
      },
    });

    // Fire 5 concurrent requests to accept the EXACT SAME join request ID (simulating network retries)
    const retryPromises = Array.from({ length: 5 }, () =>
      request(app)
        .patch(`/api/requests/${joinRequest.id}/accept`)
        .set('Authorization', `Bearer ${leaderToken}`)
    );

    const responses = await Promise.all(retryPromises);

    // All retries must return HTTP 200 (or at least no 500 errors)
    responses.forEach((res) => {
      expect([200]).toContain(res.status);
      expect(res.body.success).toBe(true);
    });

    // At least one response should indicate idempotency flag
    const idempotentFlags = responses.map((r) => r.body.data?.idempotent);
    expect(idempotentFlags.filter(Boolean).length).toBeGreaterThanOrEqual(1);

    // Verify DB state: exactly 2 members in team, no duplicate membership rows
    const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    expect(members).toHaveLength(2);
    expect(members.filter((m) => m.userId === applicant.id)).toHaveLength(1);
  });

  it('27. should serialize simultaneous team capacity reduction and join request acceptance without oversubscription', async () => {
    console.log('\n--- 🚀 Starting Concurrent Capacity Reduction vs Membership Acceptance Test ---');

    const hackathon = await prisma.hackathon.create({
      data: {
        name: 'Capacity Race Hackathon',
        description: 'Testing capacity reduction concurrency race',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 2),
      },
    });

    const defaultPasswordHash = await bcrypt.hash('Password123!', 6);

    // Leader and 1 existing member (Initial count = 2, Max = 3 -> 1 slot remaining)
    const leader = await prisma.user.create({
      data: { name: 'Cap Leader', email: 'cap_leader@test.com', passwordHash: defaultPasswordHash },
    });
    const leaderLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'cap_leader@test.com', password: 'Password123!' });
    const leaderToken = leaderLogin.body.data.token;

    const initialMember = await prisma.user.create({
      data: { name: 'Existing Member', email: 'cap_member@test.com', passwordHash: defaultPasswordHash },
    });

    const team = await prisma.team.create({
      data: {
        name: 'Capacity Fortress',
        description: 'Testing capacity reduction race',
        hackathonId: hackathon.id,
        leaderId: leader.id,
        minSize: 2,
        maxSize: 3,
        status: 'ACTIVE',
      },
    });

    await prisma.teamMember.createMany({
      data: [
        { teamId: team.id, hackathonId: hackathon.id, userId: leader.id, role: 'LEADER' },
        { teamId: team.id, hackathonId: hackathon.id, userId: initialMember.id, role: 'MEMBER' },
      ],
    });

    // Applicant with pending join request
    const applicant = await prisma.user.create({
      data: { name: 'Cap Applicant', email: 'cap_app@test.com', passwordHash: defaultPasswordHash },
    });

    const joinRequest = await prisma.joinRequest.create({
      data: {
        teamId: team.id,
        userId: applicant.id,
        status: 'PENDING',
        message: 'Trying to fill final slot while leader reduces capacity',
      },
    });

    // Fire SIMULTANEOUS requests:
    // 1. Leader tries to REDUCE maxSize from 3 down to 2 (which equals current member count)
    // 2. Leader accepts the applicant's join request (which would increase members to 3)
    const [reduceRes, acceptRes] = await Promise.all([
      request(app)
        .patch(`/api/teams/${team.id}`)
        .set('Authorization', `Bearer ${leaderToken}`)
        .send({ maxSize: 2 }),
      request(app)
        .patch(`/api/requests/${joinRequest.id}/accept`)
        .set('Authorization', `Bearer ${leaderToken}`),
    ]);

    // Inspect database state after concurrency resolution
    const finalTeam = await prisma.team.findUnique({ where: { id: team.id } });
    const finalMembers = await prisma.teamMember.findMany({ where: { teamId: team.id } });

    // CRITICAL INVARIANT: The team must NEVER exceed its configured maximum capacity!
    expect(finalMembers.length).toBeLessThanOrEqual(finalTeam.maxSize);

    // If capacity reduction won first, maxSize is 2 and accept failed with 409
    // If accept won first, members is 3 and capacity reduction was rejected with 400
    if (reduceRes.status === 200) {
      expect(finalTeam.maxSize).toBe(2);
      expect(acceptRes.status).toBe(409); // Rejected because team is now full at 2
      expect(finalMembers).toHaveLength(2);
    } else {
      expect(acceptRes.status).toBe(200);
      expect(reduceRes.status).toBe(400); // Rejected because team already has 3 members
      expect(finalTeam.maxSize).toBe(3);
      expect(finalMembers).toHaveLength(3);
    }

    // Verify audit log exists
    const auditLogs = await prisma.auditLog.findMany({ where: { teamId: team.id } });
    expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    console.log('✅ Capacity update concurrency race safely serialized via row locks!');
  });

  it('28. should execute authentic live benchmark endpoint and verify all 50-request invariants', async () => {
    const res = await request(app).post('/api/demo/concurrency-benchmark');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.totalRequests).toBe(50);
    expect(data.acceptedCount).toBe(1);
    expect(data.conflictCount).toBe(49);
    expect(data.finalPostgresMemberCount).toBe(4);
    expect(data.oversubscription).toBe(0);
    expect(data.invariantsVerified).toBe(true);
  });
});

