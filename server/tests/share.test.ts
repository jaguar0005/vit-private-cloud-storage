import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';
import CryptoService from '../src/services/crypto.service.js';
import { TokenService } from '../src/services/token.service.js';
import { SharePermission } from '@prisma/client';

describe('Phase 4: Sharing Engine, Access Policies & Download Restrictions', () => {
  const app = createApp();
  let userToken: string;
  let userId: string;
  let testFileId: string;
  let activeShareToken: string;
  const userEmail = 'share.student@vit.edu';

  beforeAll(async () => {
    // 1. Create student user
    let user = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: userEmail,
          role: 'STUDENT',
          quota_bytes: BigInt(200 * 1024 * 1024),
          used_bytes: BigInt(0),
        },
      });
    }
    userId = user.id;

    // 2. Generate auth token for user using TokenService
    userToken = TokenService.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    // 3. Create a mock encrypted file in vault
    const fileContent = Buffer.from('Cloud Computing Sharing Test Content 2026', 'utf-8');
    const storageUuid = 'test-share-storage-uuid';
    const vaultFilePath = path.resolve(config.STORAGE_VAULT_DIR, `${storageUuid}.enc`);

    // Encrypt file into vault
    const tempInPath = path.resolve(config.STORAGE_QUARANTINE_DIR, 'temp-share-in.txt');
    fs.writeFileSync(tempInPath, fileContent);
    const envelope = await CryptoService.encryptAndStore(tempInPath, storageUuid);
    if (fs.existsSync(tempInPath)) fs.unlinkSync(tempInPath);

    // Insert File into DB
    const file = await prisma.file.create({
      data: {
        name: 'share_document.txt',
        storage_uuid: storageUuid,
        mime_type: 'text/plain',
        size_bytes: BigInt(fileContent.length),
        sha256_hash: envelope.sha256Hash,
        encrypted_dek: envelope.encryptedDek,
        iv: envelope.iv,
        auth_tag: envelope.authTag,
        user_id: userId,
      },
    });
    testFileId = file.id;
  });

  afterAll(async () => {
    try {
      await prisma.shareLink.deleteMany({ where: { user_id: userId } });
      await prisma.file.deleteMany({ where: { user_id: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      const vaultPath = path.resolve(config.STORAGE_VAULT_DIR, 'test-share-storage-uuid.enc');
      if (fs.existsSync(vaultPath)) fs.unlinkSync(vaultPath);
    } catch (e) {
      // Ignore teardown errors
    }
  });

  it('SEC-08: Successfully creates a share link with expiration and password protection', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour in future

    const res = await request(app)
      .post('/api/v1/shares')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        fileId: testFileId,
        password: 'SecurePass123!',
        expiresAt,
        maxDownloads: 2,
        permission: 'DOWNLOAD',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.shareUrl).toContain('/share/');
    activeShareToken = res.body.data.token;
  });

  it('Retrieves public metadata without exposing ciphertext or password hash', async () => {
    const res = await request(app).get(`/api/v1/shares/public/${activeShareToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.fileName).toBe('share_document.txt');
    expect(res.body.data.isPasswordProtected).toBe(true);
    expect(res.body.data.permission).toBe('DOWNLOAD');
    expect(res.body.data.password_hash).toBeUndefined(); // Crucial: hash never leaked
  });

  it('Rejects unauthorized download if incorrect password is provided', async () => {
    const res = await request(app)
      .post(`/api/v1/shares/public/${activeShareToken}/download`)
      .send({ password: 'WrongPassword' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_PASSWORD');
  });

  it('Allows download with valid password and streams decrypted content', async () => {
    const res = await request(app)
      .post(`/api/v1/shares/public/${activeShareToken}/download`)
      .send({ password: 'SecurePass123!' });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('share_document.txt');
    expect(res.text).toBe('Cloud Computing Sharing Test Content 2026');

    // Verify download count incremented
    const updated = await prisma.shareLink.findUnique({ where: { token: activeShareToken } });
    expect(updated?.download_count).toBe(1);
  });

  it('SEC-09: Enforces maximum download limit (second download hits cap, third is rejected)', async () => {
    // Second download (hits max_downloads = 2)
    const res2 = await request(app)
      .post(`/api/v1/shares/public/${activeShareToken}/download`)
      .send({ password: 'SecurePass123!' });
    expect(res2.status).toBe(200);

    // Third download (must be rejected with 410 DOWNLOAD_LIMIT_REACHED)
    const res3 = await request(app)
      .post(`/api/v1/shares/public/${activeShareToken}/download`)
      .send({ password: 'SecurePass123!' });
    expect(res3.status).toBe(410);
    expect(res3.body.error.code).toBe('DOWNLOAD_LIMIT_REACHED');
  });

  it('SEC-08: Enforces link expiration timestamp strictly', async () => {
    // Create an already-expired link
    const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
    const expiredShare = await prisma.shareLink.create({
      data: {
        file_id: testFileId,
        user_id: userId,
        token: 'expired-token-xyz',
        expires_at: pastDate,
        is_active: true,
      },
    });

    const res = await request(app).get(`/api/v1/shares/public/${expiredShare.token}`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('SHARE_EXPIRED');

    const downloadRes = await request(app).post(`/api/v1/shares/public/${expiredShare.token}/download`);
    expect(downloadRes.status).toBe(410);
    expect(downloadRes.body.error.code).toBe('SHARE_EXPIRED');
  });

  it('Enforces View-Only restriction: blocks download when permission is VIEW', async () => {
    const viewShare = await prisma.shareLink.create({
      data: {
        file_id: testFileId,
        user_id: userId,
        token: 'view-only-token-abc',
        permission: SharePermission.VIEW_ONLY,
        is_active: true,
      },
    });

    // Downloading view-only link should be forbidden
    const downloadRes = await request(app).post(`/api/v1/shares/public/${viewShare.token}/download`);
    expect(downloadRes.status).toBe(403);
    expect(downloadRes.body.error.code).toBe('VIEW_ONLY');

    // Previewing view-only link is allowed
    const previewRes = await request(app).get(`/api/v1/shares/public/${viewShare.token}/download?preview=true`);
    expect(previewRes.status).toBe(200);
    expect(previewRes.headers['content-disposition']).toBe('inline');
  });

  it('Revoking a share link disables subsequent public access immediately', async () => {
    const share = await prisma.shareLink.create({
      data: {
        file_id: testFileId,
        user_id: userId,
        token: 'to-revoke-token-123',
        is_active: true,
      },
    });

    // Revoke link
    const revokeRes = await request(app)
      .delete(`/api/v1/shares/${share.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(revokeRes.status).toBe(200);

    // Public lookup now fails
    const publicRes = await request(app).get(`/api/v1/shares/public/${share.token}`);
    expect(publicRes.status).toBe(404);
  });
});
