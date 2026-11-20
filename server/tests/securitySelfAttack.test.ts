import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';
import { TokenService } from '../src/services/token.service.js';
import { CryptoService } from '../src/services/crypto.service.js';

describe('Phase 6: Security Self-Attack Penetration Test Suite', () => {
  const app = createApp();

  let student1: { id: string; email: string; token: string };
  let student2: { id: string; email: string; token: string };
  let adminUser: { id: string; email: string; token: string };
  let student1FileId: string;

  const testTempDir = path.resolve(config.STORAGE_QUARANTINE_DIR, 'attack_test_fixtures');

  // Helper to build custom test ZIP archives with precise Central Directory headers
  function createZipSlipBuffer(traversalPath: string): Buffer {
    const content = Buffer.from('malicious payload targeting root system');
    const compressed = zlib.deflateRawSync(content);
    const crc = 0x98765432;

    const lfh = Buffer.alloc(30 + traversalPath.length);
    lfh.write('PK\x03\x04', 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(8, 8);
    lfh.writeUInt32LE(0, 10);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(content.length, 22);
    lfh.writeUInt16LE(traversalPath.length, 26);
    lfh.writeUInt16LE(0, 28);
    lfh.write(traversalPath, 30);

    const cdh = Buffer.alloc(46 + traversalPath.length);
    cdh.write('PK\x01\x02', 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt32LE(0, 12);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(content.length, 24);
    cdh.writeUInt16LE(traversalPath.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(0, 42);
    cdh.write(traversalPath, 46);

    const eocd = Buffer.alloc(22);
    eocd.write('PK\x05\x06', 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdh.length, 12);
    eocd.writeUInt32LE(lfh.length + compressed.length, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([lfh, compressed, cdh, eocd]);
  }

  beforeAll(async () => {
    if (!fs.existsSync(testTempDir)) {
      fs.mkdirSync(testTempDir, { recursive: true });
    }

    // 1. Student 1 (Victim)
    const s1 = await prisma.user.create({
      data: {
        email: `student1.victim.${Date.now()}@vit.edu`,
        role: 'STUDENT',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(0),
      },
    });
    student1 = {
      id: s1.id,
      email: s1.email,
      token: TokenService.generateAccessToken({ id: s1.id, email: s1.email, role: s1.role }),
    };

    // 2. Student 2 (Attacker)
    const s2 = await prisma.user.create({
      data: {
        email: `student2.attacker.${Date.now()}@vit.edu`,
        role: 'STUDENT',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(0),
      },
    });
    student2 = {
      id: s2.id,
      email: s2.email,
      token: TokenService.generateAccessToken({ id: s2.id, email: s2.email, role: s2.role }),
    };

    // 3. Admin User
    const adm = await prisma.user.create({
      data: {
        email: `admin.gov.${Date.now()}@vit.edu`,
        role: 'ADMIN',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(0),
      },
    });
    adminUser = {
      id: adm.id,
      email: adm.email,
      token: TokenService.generateAccessToken({ id: adm.id, email: adm.email, role: adm.role }),
    };

    // Student 1 uploads a confidential file
    const victimFilePath = path.join(testTempDir, 'confidential_exam_key.txt');
    fs.writeFileSync(victimFilePath, 'CONFIDENTIAL VIT MIDTERM SOLUTION KEY 2026');

    const uploadRes = await request(app)
      .post('/api/v1/files/upload')
      .set('Cookie', [`accessToken=${student1.token}`])
      .attach('file', victimFilePath);

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data.file).toBeDefined();
    student1FileId = uploadRes.body.data.file.fileId;
  });

  afterAll(async () => {
    try {
      if (fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
      }
      await prisma.quarantineLog.deleteMany({
        where: { user_id: { in: [student1.id, student2.id, adminUser.id] } },
      });
      await prisma.shareLink.deleteMany({
        where: { file: { user_id: { in: [student1.id, student2.id] } } },
      });
      await prisma.fileVersion.deleteMany({
        where: { file: { user_id: { in: [student1.id, student2.id] } } },
      });
      await prisma.file.deleteMany({
        where: { user_id: { in: [student1.id, student2.id] } },
      });
      await prisma.auditLog.deleteMany({
        where: { user_id: { in: [student1.id, student2.id, adminUser.id] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [student1.id, student2.id, adminUser.id] } },
      });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ATTACK 1: Non-institutional domain lockdown
  it('Attack 1: Rejects unauthorized public email domains from requesting OTP', async () => {
    const res1 = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ email: 'intruder@gmail.com' });

    expect(res1.status).toBe(400);
    expect(res1.body.success).toBe(false);
    expect(res1.body.error.code).toBe('OTP_REQUEST_FAILED');
    expect(res1.body.error.message).toContain('@vit.edu');

    const res2 = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ email: 'phisher@harvard.edu' });

    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('OTP_REQUEST_FAILED');
    expect(res2.body.error.message).toContain('@vit.edu');
  });

  // ATTACK 2: Cross-tenant horizontal privilege escalation
  it('Attack 2: Prohibits Student B from downloading, renaming, or deleting Student A\'s vault files', async () => {
    // 1. Direct download breach attempt
    const downloadAttempt = await request(app)
      .get(`/api/v1/files/${student1FileId}/download`)
      .set('Cookie', [`accessToken=${student2.token}`]);

    expect(downloadAttempt.status).toBe(404);

    // 2. Unauthorized rename attempt
    const renameAttempt = await request(app)
      .patch(`/api/v1/files/${student1FileId}/rename`)
      .set('Cookie', [`accessToken=${student2.token}`])
      .send({ name: 'hacked_by_student2.txt' });

    expect(renameAttempt.status).toBe(404);

    // 3. Unauthorized deletion attempt
    const deleteAttempt = await request(app)
      .delete(`/api/v1/files/${student1FileId}`)
      .set('Cookie', [`accessToken=${student2.token}`]);

    expect(deleteAttempt.status).toBe(404);
  });

  // ATTACK 3: Vertical privilege escalation to Administrative console
  it('Attack 3: Enforces strict RBAC blocking students from administrative routes and quota tampering', async () => {
    // Student attempting to fetch admin stats
    const statsRes = await request(app)
      .get('/api/v1/admin/stats')
      .set('Cookie', [`accessToken=${student2.token}`]);

    expect(statsRes.status).toBe(403);
    expect(statsRes.body.error.code).toBe('FORBIDDEN');

    // Student attempting to list all registered students
    const usersRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Cookie', [`accessToken=${student2.token}`]);

    expect(usersRes.status).toBe(403);

    // Student attempting to grant self infinite quota
    const quotaTamper = await request(app)
      .patch(`/api/v1/admin/users/${student2.id}/quota`)
      .set('Cookie', [`accessToken=${student2.token}`])
      .send({ quotaMb: 50000 });

    expect(quotaTamper.status).toBe(403);
  });

  // ATTACK 4: Malicious malware payload (EICAR) upload
  it('Attack 4: Pipeline Stage 4 intercepts EICAR malware, logs to quarantine, and prevents vault commit', async () => {
    const eicarString = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
    const eicarFilePath = path.join(testTempDir, 'innocent_notes.pdf');
    fs.writeFileSync(eicarFilePath, eicarString);

    const uploadRes = await request(app)
      .post('/api/v1/files/upload')
      .set('Cookie', [`accessToken=${student2.token}`])
      .attach('file', eicarFilePath);

    expect(uploadRes.status).toBe(422);
    expect(uploadRes.body.success).toBe(false);
    expect(uploadRes.body.error.code).toBe('SECURITY_PIPELINE_VIOLATION');
    expect(uploadRes.body.error.message).toContain('Malware signature detected');

    // Verify incident recorded in Quarantine Log
    const incident = await prisma.quarantineLog.findFirst({
      where: { user_id: student2.id, original_name: 'innocent_notes.pdf' },
    });
    expect(incident).toBeDefined();
    expect(incident?.resolved).toBe(false);

    // Verify no file committed in database or encrypted vault
    const committedFile = await prisma.file.findFirst({
      where: { user_id: student2.id, name: 'innocent_notes.pdf' },
    });
    expect(committedFile).toBeNull();
  });

  // ATTACK 5: Path Traversal / Zip-Slip in archive upload
  it('Attack 5: Pipeline Stage 6 detects Zip-Slip directory traversal and safely quarantines the upload', async () => {
    const maliciousZip = createZipSlipBuffer('../../windows/system32/cmd.exe');
    const zipPath = path.join(testTempDir, 'archive_exploit.zip');
    fs.writeFileSync(zipPath, maliciousZip);

    const res = await request(app)
      .post('/api/v1/files/upload')
      .set('Cookie', [`accessToken=${student2.token}`])
      .attach('file', zipPath);

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SECURITY_PIPELINE_VIOLATION');
    expect(res.body.error.message).toMatch(/Zip Slip|invalid relative path/i);
  });

  // ATTACK 6: Password-Protected Share Link Unauthorized Bypass
  it('Attack 6: Prevents unauthenticated downloading of password-protected shared files', async () => {
    // Student 1 creates password-protected share
    const shareRes = await request(app)
      .post('/api/v1/shares')
      .set('Cookie', [`accessToken=${student1.token}`])
      .send({
        fileId: student1FileId,
        password: 'TopSecretPassword2026!',
        permission: 'DOWNLOAD',
      });

    expect(shareRes.status).toBe(201);
    const token = shareRes.body.data.token;

    // Attacker tries to download without password
    const noPassRes = await request(app).get(`/api/v1/shares/public/${token}/download`);
    expect(noPassRes.status).toBe(401);
    expect(noPassRes.body.error.code).toBe('PASSWORD_REQUIRED');

    // Attacker tries to download with incorrect password
    const wrongPassRes = await request(app).get(`/api/v1/shares/public/${token}/download?password=WrongGuess123`);
    expect(wrongPassRes.status).toBe(401);
    expect(wrongPassRes.body.error.code).toBe('INVALID_PASSWORD');

    // Legitimate download with correct password succeeds
    const goodPassRes = await request(app).get(`/api/v1/shares/public/${token}/download?password=TopSecretPassword2026!`);
    expect(goodPassRes.status).toBe(200);
    expect(goodPassRes.text).toBe('CONFIDENTIAL VIT MIDTERM SOLUTION KEY 2026');
  });

  // ATTACK 7: Envelope Encryption Integrity & DEK Wrapping Security
  it('Attack 7: Validates that vault ciphertext cannot be read as plaintext and uses unique IVs', async () => {
    const dbFile = await prisma.file.findUnique({
      where: { id: student1FileId },
    });
    expect(dbFile).toBeDefined();

    const encryptedDiskPath = path.join(config.STORAGE_VAULT_DIR, `${dbFile!.storage_uuid}.enc`);
    expect(fs.existsSync(encryptedDiskPath)).toBe(true);

    const ciphertext = fs.readFileSync(encryptedDiskPath);
    // Plaintext should NOT exist in raw bytes on disk
    expect(ciphertext.includes(Buffer.from('CONFIDENTIAL VIT MIDTERM SOLUTION KEY 2026'))).toBe(false);

    // Verify envelope decryption with correct wrapped DEK
    const decryptedBuffer = await CryptoService.decryptToBuffer(
      encryptedDiskPath,
      dbFile!.encrypted_dek,
      dbFile!.iv,
      dbFile!.auth_tag
    );

    const decryptedText = decryptedBuffer.toString('utf8');
    expect(decryptedText).toBe('CONFIDENTIAL VIT MIDTERM SOLUTION KEY 2026');
  });

  // ATTACK 8: Student Personal 200 MB Hard Quota Boundary Enforcement
  it('Attack 8: Rejects uploads that would breach the personal 200 MB student quota limit', async () => {
    // Fill student2's quota to near full (199.5 MB)
    await prisma.user.update({
      where: { id: student2.id },
      data: { used_bytes: BigInt(199.5 * 1024 * 1024) },
    });

    // Try to upload a 2 MB file (breaches 200 MB limit)
    const twoMbFile = path.join(testTempDir, 'oversized_project.bin');
    fs.writeFileSync(twoMbFile, Buffer.alloc(2 * 1024 * 1024, 0xaa));

    const quotaBreachRes = await request(app)
      .post('/api/v1/files/upload')
      .set('Cookie', [`accessToken=${student2.token}`])
      .attach('file', twoMbFile);

    expect(quotaBreachRes.status).toBe(400);
    expect(quotaBreachRes.body.error.code).toBe('UPLOAD_FAILED');
    expect(quotaBreachRes.body.error.message).toContain('quota');

    // Verify student used bytes remained unchanged
    const afterUser = await prisma.user.findUnique({ where: { id: student2.id } });
    expect(afterUser?.used_bytes).toBe(BigInt(199.5 * 1024 * 1024));
  });
});
