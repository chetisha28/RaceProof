import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import { cleanDatabase, disconnectDatabase } from './setup.js';

describe('Authentication & Authorization Suite', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  it('1. should register a new user successfully with HTTP 201', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        password: 'Password123!',
        bio: 'First computer programmer',
        skills: ['Algorithms', 'Mathematics'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('ada@example.com');
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('2. should reject duplicate registration with HTTP 409 Conflict', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Alan Turing',
        email: 'alan@example.com',
        password: 'Password123!',
      });

    const duplicateRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Alan Turing 2',
        email: 'alan@example.com',
        password: 'Password123!',
      });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.success).toBe(false);
    expect(duplicateRes.body.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('3. should reject registration with invalid email or weak password with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Bad Input',
        email: 'not-an-email',
        password: '123',
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('4. should login successfully with valid credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'grace@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.name).toBe('Grace Hopper');
  });

  it('5. should reject login with invalid password with HTTP 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Grace Hopper',
        email: 'grace@example.com',
        password: 'Password123!',
      });

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'grace@example.com',
        password: 'WrongPassword!',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('6. should reject login for non-existent email with HTTP 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'ghost@example.com',
        password: 'Password123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('7. should fetch current user profile when authenticated', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Claude Shannon',
        email: 'claude@example.com',
        password: 'Password123!',
      });

    const token = regRes.body.data.token;

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('claude@example.com');
  });

  it('8. should reject /api/auth/me with HTTP 401 when unauthenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('8b. should enforce rate limiting on sensitive auth endpoints when enabled', async () => {
    // loginLimiter max is 30 requests per 15 mins
    const requests = Array.from({ length: 32 }, () =>
      request(app)
        .post('/api/auth/login')
        .set('x-test-ratelimit', 'true')
        .send({ email: 'ratelimit@example.com', password: 'Password123!' })
    );

    const responses = await Promise.all(requests);
    const rateLimited = responses.filter((r) => r.status === 429);
    expect(rateLimited.length).toBeGreaterThanOrEqual(1);
    expect(rateLimited[0].body.code).toBe('LOGIN_RATE_LIMIT_EXCEEDED');
  });
});

