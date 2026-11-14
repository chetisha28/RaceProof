import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/database.js';
import { cleanDatabase, disconnectDatabase } from './setup.js';

describe('Membership, Join Requests & Invitations Suite', () => {
  let hackathon;
  let leader;
  let leaderToken;
  let memberUser;
  let memberToken;
  let applicant;
  let applicantToken;
  let team;

  beforeEach(async () => {
    await cleanDatabase();

    hackathon = await prisma.hackathon.create({
      data: {
        name: 'Membership Testathon',
        description: 'Testathon description',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 5),
      },
    });

    // Leader
    const regLeader = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Leader User', email: 'leader@test.com', password: 'Password123!' });
    leader = regLeader.body.data.user;
    leaderToken = regLeader.body.data.token;

    // Member
    const regMember = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Regular Member', email: 'member@test.com', password: 'Password123!' });
    memberUser = regMember.body.data.user;
    memberToken = regMember.body.data.token;

    // Applicant
    const regApp = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Applicant User', email: 'applicant@test.com', password: 'Password123!' });
    applicant = regApp.body.data.user;
    applicantToken = regApp.body.data.token;

    // Create Team (maxSize: 3)
    const teamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({
        name: 'Core Team',
        description: 'Testing membership transitions',
        hackathonId: hackathon.id,
        maxSize: 3,
      });
    team = teamRes.body.data;
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('15. should prevent duplicate pending join requests from the same user', async () => {
    const firstReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'First request' });

    expect(firstReq.status).toBe(201);

    const dupReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Second request' });

    expect(dupReq.status).toBe(409);
    expect(dupReq.body.code).toBe('DUPLICATE_PENDING_REQUEST');
  });

  it('16. should allow leader to accept a join request and update audit logs', async () => {
    const joinReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Please accept me' });

    const requestId = joinReq.body.data.id;

    const acceptRes = await request(app)
      .patch(`/api/requests/${requestId}/accept`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.memberCount).toBe(2);

    // Verify AuditLog record was created
    const auditLogs = await prisma.auditLog.findMany({
      where: { teamId: team.id, action: 'REQUEST_ACCEPTED' },
    });
    expect(auditLogs).toHaveLength(1);
  });

  it('17. should allow leader to decline a join request', async () => {
    const joinReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Please review' });

    const requestId = joinReq.body.data.id;

    const declineRes = await request(app)
      .patch(`/api/requests/${requestId}/decline`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(declineRes.status).toBe(200);

    const updated = await prisma.joinRequest.findUnique({ where: { id: requestId } });
    expect(updated.status).toBe('DECLINED');
  });

  it('18. should allow applicant to cancel their own pending join request', async () => {
    const joinReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Mistake, cancelling' });

    const requestId = joinReq.body.data.id;

    const cancelRes = await request(app)
      .delete(`/api/requests/${requestId}`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(cancelRes.status).toBe(200);

    const updated = await prisma.joinRequest.findUnique({ where: { id: requestId } });
    expect(updated.status).toBe('CANCELLED');
  });

  it('19. should allow a regular member to leave the team', async () => {
    // Add applicant as member first
    const joinReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Join me' });

    await request(app)
      .patch(`/api/requests/${joinReq.body.data.id}/accept`)
      .set('Authorization', `Bearer ${leaderToken}`);

    // Member leaves
    const leaveRes = await request(app)
      .post(`/api/teams/${team.id}/leave`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(leaveRes.status).toBe(200);

    const members = await prisma.teamMember.findMany({ where: { teamId: team.id } });
    expect(members).toHaveLength(1);
  });

  it('20. should prevent leader from leaving team if other members exist without transferring leadership', async () => {
    // Add applicant as member
    const joinReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Join me' });

    await request(app)
      .patch(`/api/requests/${joinReq.body.data.id}/accept`)
      .set('Authorization', `Bearer ${leaderToken}`);

    // Leader tries to leave directly
    const leaveRes = await request(app)
      .post(`/api/teams/${team.id}/leave`)
      .set('Authorization', `Bearer ${leaderToken}`);

    expect(leaveRes.status).toBe(400);
    expect(leaveRes.body.code).toBe('LEADER_CANNOT_LEAVE_WITH_MEMBERS');
  });

  it('21. should allow leadership transfer to an active team member', async () => {
    // Add applicant as member
    const joinReq = await request(app)
      .post(`/api/teams/${team.id}/requests`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ message: 'Join' });

    await request(app)
      .patch(`/api/requests/${joinReq.body.data.id}/accept`)
      .set('Authorization', `Bearer ${leaderToken}`);

    // Transfer leadership to applicant
    const transferRes = await request(app)
      .post(`/api/teams/${team.id}/transfer-leadership`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ newLeaderId: applicant.id });

    expect(transferRes.status).toBe(200);

    // Verify DB state
    const updatedTeam = await prisma.team.findUnique({ where: { id: team.id } });
    expect(updatedTeam.leaderId).toBe(applicant.id);

    const oldLeaderMember = await prisma.teamMember.findFirst({ where: { teamId: team.id, userId: leader.id } });
    expect(oldLeaderMember.role).toBe('MEMBER');

    const newLeaderMember = await prisma.teamMember.findFirst({ where: { teamId: team.id, userId: applicant.id } });
    expect(newLeaderMember.role).toBe('LEADER');
  });

  it('22. should generate invite link, accept invite, and prevent token reuse', async () => {
    // Leader generates invite
    const inviteRes = await request(app)
      .post(`/api/teams/${team.id}/invites`)
      .set('Authorization', `Bearer ${leaderToken}`)
      .send({ expiresInHours: 24 });

    expect(inviteRes.status).toBe(201);
    const token = inviteRes.body.data.token;
    expect(token).toBeDefined();

    // Applicant accepts invite
    const acceptRes = await request(app)
      .post(`/api/invites/${token}/accept`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.data.memberCount).toBe(2);

    // Second user attempts to reuse single-use invite
    const reuseRes = await request(app)
      .post(`/api/invites/${token}/accept`)
      .set('Authorization', `Bearer ${memberToken}`);

    expect(reuseRes.status).toBe(409);
    expect(reuseRes.body.code).toBe('INVITE_ALREADY_USED');
  });

  it('23. should reject expired invitation tokens with HTTP 410 Gone', async () => {
    // Manually create an expired invite in DB
    const rawToken = 'expired-token-1234567890abcdef1234567890abcdef';
    const { hashSecureToken } = await import('../src/utils/crypto.js');
    const tokenHash = hashSecureToken(rawToken);

    await prisma.invite.create({
      data: {
        teamId: team.id,
        tokenHash,
        createdBy: leader.id,
        expiresAt: new Date(Date.now() - 3600000), // expired 1 hour ago
      },
    });

    const res = await request(app)
      .post(`/api/invites/${rawToken}/accept`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(res.status).toBe(410);
    expect(res.body.code).toBe('INVITE_EXPIRED');
  });
});

