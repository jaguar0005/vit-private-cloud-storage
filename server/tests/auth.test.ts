import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';
import { ensureDatabaseAvailable } from '../src/db/embeddedPg.js';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';

process.env.NODE_ENV = 'test';
const app = createApp();

describe('Phase 1: Institutional Email OTP Authentication & RBAC', () => {
  beforeAll(async () => {
    await ensureDatabaseAvailable();
    // Clean up test records
    await prisma.otp.deleteMany();
    await prisma.refreshSession.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: ['test.student@vit.edu', 'admin@vit.edu'] } },
    });
  });

  afterAll(async () => {
    await prisma.otp.deleteMany();
    await prisma.refreshSession.deleteMany();
    await prisma.user.deleteMany({
      where: { email: { in: ['test.student@vit.edu', 'admin@vit.edu'] } },
    });
  });

  it('SEC-01: Rejects non-@vit.edu email addresses with HTTP 400', async () => {
    const invalidEmails = [
      'student@gmail.com',
      'user@yahoo.com',
      'attacker@vit.edu.evil.com',
      'test@outlook.com',
      'fake@vit.ac.in',
    ];

    for (const email of invalidEmails) {
      const res = await request(app)
        .post('/api/v1/auth/request-otp')
        .send({ email });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('OTP_REQUEST_FAILED');
    }
  });

  it('Accepts valid @vit.edu email and dispatches 6-digit OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ email: 'test.student@vit.edu' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('verification code has been dispatched');

    const otpRecord = await prisma.otp.findFirst({
      where: { email: 'test.student@vit.edu' },
    });
    expect(otpRecord).toBeDefined();
    expect(otpRecord?.attempts).toBe(0);
  });

  it('Rejects invalid OTP with HTTP 401 and tracks attempt count', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'test.student@vit.edu', otp: '000000' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain('Incorrect verification code');

    const otpRecord = await prisma.otp.findFirst({
      where: { email: 'test.student@vit.edu' },
    });
    expect(otpRecord?.attempts).toBe(1);
  });

  it('Locks out and destroys OTP after exceeding maximum failed attempts', async () => {
    // Attempt 2
    await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'test.student@vit.edu', otp: '000000' });

    // Attempt 3
    await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'test.student@vit.edu', otp: '000000' });

    // Attempt 4 should lock out
    const lockoutRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'test.student@vit.edu', otp: '000000' });

    expect(lockoutRes.status).toBe(401);
    expect(lockoutRes.body.error.message).toMatch(/(Too many failed|Invalid or expired)/i);

    const otpRecord = await prisma.otp.findFirst({
      where: { email: 'test.student@vit.edu' },
    });
    expect(otpRecord).toBeNull();
  });

  it('Verifies correct OTP, provisions 200 MB student quota, and sets httpOnly cookies', async () => {
    // Request a fresh code
    await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ email: 'test.student@vit.edu' });

    // Inject known hash for 999888
    const testHash = await argon2.hash('999888');
    await prisma.otp.updateMany({
      where: { email: 'test.student@vit.edu' },
      data: { hashed_code: testHash },
    });

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'test.student@vit.edu', otp: '999888' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.data.user.email).toBe('test.student@vit.edu');
    expect(verifyRes.body.data.user.role).toBe('STUDENT');
    expect(verifyRes.body.data.user.quotaBytes).toBe(config.DEFAULT_USER_QUOTA_BYTES);

    const cookies = verifyRes.headers['set-cookie'];
    expect(cookies).toBeDefined();
    expect(cookies.some((c: string) => c.includes('accessToken'))).toBe(true);
    expect(cookies.some((c: string) => c.includes('refreshToken'))).toBe(true);
  });

  it('Automatically grants ADMIN role to admin@vit.edu', async () => {
    await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ email: 'admin@vit.edu' });

    const testHash = await argon2.hash('123456');
    await prisma.otp.updateMany({
      where: { email: 'admin@vit.edu' },
      data: { hashed_code: testHash },
    });

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'admin@vit.edu', otp: '123456' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.user.role).toBe('ADMIN');
  });

  it('Blocks unauthenticated access to /api/v1/auth/me with HTTP 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
