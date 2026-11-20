import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/db/prisma.js';
import { QuotaService, QuotaExceededError } from '../src/services/quota.service.js';
import { ensureDatabaseAvailable } from '../src/db/embeddedPg.js';
import config from '../src/config/index.js';

describe('Phase 2: Atomic Storage Quota & Concurrency Row Locking', () => {
  let testUserId: string;

  beforeAll(async () => {
    await ensureDatabaseAvailable();

    // Create a dedicated test user with default 200 MB quota
    const testUser = await prisma.user.upsert({
      where: { email: 'quota.tester@vit.edu' },
      update: { used_bytes: BigInt(0) },
      create: {
        email: 'quota.tester@vit.edu',
        role: 'STUDENT',
        quota_bytes: BigInt(config.DEFAULT_USER_QUOTA_BYTES), // 209,715,200 bytes (200 MB)
        used_bytes: BigInt(0),
      },
    });

    testUserId = testUser.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: 'quota.tester@vit.edu' },
    });
  });

  it('SEC-02: Rejects single upload reservation exceeding 200 MB total quota', async () => {
    const excessiveBytes = 250 * 1024 * 1024; // 250 MB (exceeds 200 MB limit)

    await expect(
      QuotaService.reserveQuota(testUserId, excessiveBytes)
    ).rejects.toThrow(QuotaExceededError);

    // Verify used_bytes remained at 0
    const status = await QuotaService.getQuotaStatus(testUserId);
    expect(status.usedBytes).toBe(0);
  });

  it('Allows valid upload reservation within quota', async () => {
    const validBytes = 50 * 1024 * 1024; // 50 MB
    const res = await QuotaService.reserveQuota(testUserId, validBytes);

    expect(res.reserved).toBe(true);
    expect(res.newUsedBytes).toBe(validBytes);

    const status = await QuotaService.getQuotaStatus(testUserId);
    expect(status.usedBytes).toBe(validBytes);
    expect(status.remainingBytes).toBe(config.DEFAULT_USER_QUOTA_BYTES - validBytes);
  });

  it('SEC-03: Concurrency Race Condition: Concurrent uploads cannot overshoot 200 MB quota', async () => {
    // Reset used_bytes to 0
    await prisma.user.update({
      where: { id: testUserId },
      data: { used_bytes: BigInt(0) },
    });

    // Two parallel requests attempting to reserve 120 MB each (combined 240 MB > 200 MB)
    const requestSize = 120 * 1024 * 1024; // 120 MB

    const results = await Promise.allSettled([
      QuotaService.reserveQuota(testUserId, requestSize),
      QuotaService.reserveQuota(testUserId, requestSize),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one reservation must succeed, and the other must be rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    // Verify used_bytes is exactly 120 MB and never overshot 200 MB
    const finalStatus = await QuotaService.getQuotaStatus(testUserId);
    expect(finalStatus.usedBytes).toBe(requestSize);
    expect(finalStatus.usedBytes).toBeLessThanOrEqual(config.DEFAULT_USER_QUOTA_BYTES);
  });

  it('Releases reserved quota upon failure without leaking storage', async () => {
    // Current used is 120 MB from previous test; release 70 MB
    await QuotaService.releaseQuota(testUserId, 70 * 1024 * 1024);

    const status = await QuotaService.getQuotaStatus(testUserId);
    expect(status.usedBytes).toBe(50 * 1024 * 1024);
  });
});
