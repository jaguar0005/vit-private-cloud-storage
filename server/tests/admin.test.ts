import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import { TokenService } from '../src/services/token.service.js';

describe('Phase 5: Administrative Governance Console & Audit Exports', () => {
  const app = createApp();
  let adminToken: string;
  let studentToken: string;
  let adminUserId: string;
  let studentUserId: string;
  let testQuarantineId: string;

  beforeAll(async () => {
    // 1. Create Admin User
    const admin = await prisma.user.create({
      data: {
        email: `admin.${Date.now()}@vit.edu`,
        role: 'ADMIN',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(0),
      },
    });
    adminUserId = admin.id;
    adminToken = TokenService.generateAccessToken({ id: admin.id, email: admin.email, role: admin.role });

    // 2. Create Student User
    const student = await prisma.user.create({
      data: {
        email: `student.${Date.now()}@vit.edu`,
        role: 'STUDENT',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(50 * 1024 * 1024), // 50 MB used
      },
    });
    studentUserId = student.id;
    studentToken = TokenService.generateAccessToken({ id: student.id, email: student.email, role: student.role });

    // 3. Create a mock Quarantine Log
    const incident = await prisma.quarantineLog.create({
      data: {
        user_id: studentUserId,
        original_name: 'eicar_malware_test.com',
        size_bytes: BigInt(68),
        violation_reason: 'Malware signature detected (EICAR_STANDARD_TEST_SIGNATURE)',
        ip_address: '127.0.0.1',
        resolved: false,
      },
    });
    testQuarantineId = incident.id;
  });

  afterAll(async () => {
    try {
      await prisma.quarantineLog.deleteMany({ where: { user_id: studentUserId } });
      await prisma.auditLog.deleteMany({ where: { user_id: { in: [adminUserId, studentUserId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminUserId, studentUserId] } } });
    } catch {
      // Ignore
    }
  });

  it('SEC-14: Rejects student from administrative endpoints with HTTP 403 Forbidden', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('Allows admin to fetch 20 GB dedicated laptop pool telemetry & tenant statistics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.pool).toBeDefined();
    expect(res.body.data.pool.dedicatedPoolLimitGb).toBe(20);
    expect(res.body.data.tenants.totalRegistered).toBeGreaterThanOrEqual(2);
    expect(res.body.data.security.unresolvedThreats).toBeGreaterThanOrEqual(1);
  });

  it('Lists university users with storage quota utilization', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toBeDefined();
    const foundStudent = res.body.data.users.find((u: any) => u.id === studentUserId);
    expect(foundStudent).toBeDefined();
    expect(foundStudent.usagePercentage).toBe(25); // 50MB of 200MB = 25%
  });

  it('Admin overrides student quota with custom allocation and logs audit trail', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${studentUserId}/quota`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotaMb: 500 }); // Upgrade thesis student to 500 MB

    expect(res.status).toBe(200);
    expect(res.body.data.quotaBytes).toBe((500 * 1024 * 1024).toString());

    // Verify DB update
    const dbUser = await prisma.user.findUnique({ where: { id: studentUserId } });
    expect(dbUser?.quota_bytes).toBe(BigInt(500 * 1024 * 1024));

    // Verify audit log record
    const auditRecord = await prisma.auditLog.findFirst({
      where: { user_id: adminUserId, action: 'ADMIN_QUOTA_OVERRIDE' },
    });
    expect(auditRecord).toBeDefined();
  });

  it('Rejects quota override if target quota is smaller than currently utilized bytes', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${studentUserId}/quota`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quotaMb: 20 }); // Student has 50 MB used!

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('cannot be less than student');
  });

  it('Inspects security quarantine incidents and marks threat as reviewed & resolved', async () => {
    // List quarantine
    const listRes = await request(app)
      .get('/api/v1/admin/quarantine')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    const incident = listRes.body.data.incidents.find((i: any) => i.id === testQuarantineId);
    expect(incident).toBeDefined();
    expect(incident.resolved).toBe(false);

    // Resolve incident
    const resolveRes = await request(app)
      .patch(`/api/v1/admin/quarantine/${testQuarantineId}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.resolved).toBe(true);

    // Verify DB resolved status
    const dbIncident = await prisma.quarantineLog.findUnique({ where: { id: testQuarantineId } });
    expect(dbIncident?.resolved).toBe(true);
  });

  it('Streams formatted institutional audit CSV export with proper MIME type & headers', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('vit_cloud_audit_');
    expect(res.text).toContain('ID,Timestamp,UserEmail,Action,ResourceId,IPAddress,Details');
    expect(res.text).toContain('ADMIN_QUOTA_OVERRIDE');
  });
});
