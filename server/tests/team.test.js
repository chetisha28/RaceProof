import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/config/database.js';
import { cleanDatabase, disconnectDatabase } from './setup.js';

describe('Team Creation & Discovery Suite', () => {
  let hackathon;
  let user1;
  let token1;
  let user2;
  let token2;

  beforeEach(async () => {
    await cleanDatabase();

    // Create test hackathon
    hackathon = await prisma.hackathon.create({
      data: {
        name: 'Test Hackathon 2026',
        description: 'Testing team constraints',
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000 * 3),
      },
    });

    // Register User 1
    const reg1 = await request(app)
      .post('/api/auth/register')
      .send({ name: 'User One', email: 'user1@test.com', password: 'Password123!', skills: ['Node.js', 'React'] });
    user1 = reg1.body.data.user;
    token1 = reg1.body.data.token;

    // Register User 2
    const reg2 = await request(app)
      .post('/api/auth/register')
      .send({ name: 'User Two', email: 'user2@test.com', password: 'Password123!', skills: ['Python'] });
    user2 = reg2.body.data.user;
    token2 = reg2.body.data.token;
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('9. should create a team and automatically make creator LEADER with HTTP 201', async () => {
    const res = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Alpha Team',
        description: 'Building something great',
        hackathonId: hackathon.id,
        maxSize: 4,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Alpha Team');
    expect(res.body.data.leaderId).toBe(user1.id);

    // Verify creator is automatically first member with role LEADER in DB
    const members = await prisma.teamMember.findMany({ where: { teamId: res.body.data.id } });
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(user1.id);
    expect(members[0].role).toBe('LEADER');
  });

  it('10. should reject team creation with invalid capacity (< 2 or > 10) with HTTP 400', async () => {
    const resUnder = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Too Small',
        description: 'Invalid team capacity',
        hackathonId: hackathon.id,
        maxSize: 1,
      });

    expect(resUnder.status).toBe(400);

    const resOver = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Too Large',
        description: 'Invalid team capacity',
        hackathonId: hackathon.id,
        maxSize: 15,
      });

    expect(resOver.status).toBe(400);
  });

  it('11. should prevent a user from creating/joining multiple teams in the same hackathon', async () => {
    // User 1 creates first team
    await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'First Team',
        description: 'First team description',
        hackathonId: hackathon.id,
        maxSize: 4,
      });

    // User 1 attempts to create second team in same hackathon
    const resSecond = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Second Team',
        description: 'Second team description',
        hackathonId: hackathon.id,
        maxSize: 4,
      });

    expect(resSecond.status).toBe(409);
    expect(resSecond.body.code).toBe('ALREADY_IN_TEAM');
  });

  it('12. should support team discovery with search, filter, and pagination', async () => {
    // Create team by User 1
    await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'React Wizards',
        description: 'Specialists in interactive client apps',
        hackathonId: hackathon.id,
        maxSize: 3,
      });

    // Search by name
    const searchRes = await request(app).get(`/api/teams?search=Wizards&hackathonId=${hackathon.id}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].name).toBe('React Wizards');
    expect(searchRes.body.data[0].availableSeats).toBe(2);
    expect(searchRes.body.data[0].memberCount).toBe(1);

    // Search by non-matching query
    const emptyRes = await request(app).get(`/api/teams?search=NonExistent`);
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data).toHaveLength(0);
  });

  it('13. should reject team settings update by non-leader with HTTP 403', async () => {
    const teamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Leader Only Team',
        description: 'Testing permissions',
        hackathonId: hackathon.id,
      });

    const updateRes = await request(app)
      .patch(`/api/teams/${teamRes.body.data.id}`)
      .set('Authorization', `Bearer ${token2}`)
      .send({ name: 'Hacked Name' });

    expect(updateRes.status).toBe(403);
    expect(updateRes.body.code).toBe('FORBIDDEN_NOT_LEADER');
  });

  it('14. should allow leader to disband team and release member constraints', async () => {
    const teamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'Temporary Team',
        description: 'Will be disbanded',
        hackathonId: hackathon.id,
      });

    const teamId = teamRes.body.data.id;

    const disbandRes = await request(app)
      .delete(`/api/teams/${teamId}`)
      .set('Authorization', `Bearer ${token1}`);

    expect(disbandRes.status).toBe(200);

    // User 1 should now be free to create another team in this hackathon
    const newTeamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        name: 'New Fresh Team',
        description: 'Created after disbanding old team',
        hackathonId: hackathon.id,
      });

    expect(newTeamRes.status).toBe(201);
  });
});

