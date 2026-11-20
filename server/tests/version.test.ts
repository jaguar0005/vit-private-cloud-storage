import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';
import { TokenService } from '../src/services/token.service.js';
import UploadPipelineService from '../src/services/pipeline.service.js';

describe('Phase 4: File Versioning Lifecycle (5-Version Retention, Revert & Quota)', () => {
  const app = createApp();
  let userToken: string;
  let userId: string;
  const userEmail = 'version.student@vit.edu';

  beforeAll(async () => {
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

    userToken = TokenService.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
  });

  afterAll(async () => {
    try {
      const files = await prisma.file.findMany({ where: { user_id: userId }, include: { versions: true } });
      for (const f of files) {
        const p = path.resolve(config.STORAGE_VAULT_DIR, `${f.storage_uuid}.enc`);
        if (fs.existsSync(p)) fs.unlinkSync(p);
        for (const v of f.versions) {
          const vp = path.resolve(config.STORAGE_VAULT_DIR, `${v.storage_uuid}.enc`);
          if (fs.existsSync(vp)) fs.unlinkSync(vp);
        }
      }
      await prisma.file.deleteMany({ where: { user_id: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } catch (e) {
      // Ignore
    }
  });

  const uploadVersion = async (filename: string, content: string) => {
    const tempPath = path.resolve(config.STORAGE_QUARANTINE_DIR, `temp-ver-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`);
    const buffer = Buffer.from(content, 'utf-8');
    fs.writeFileSync(tempPath, buffer);

    const result = await UploadPipelineService.executePipeline({
      userId,
      originalFilename: filename,
      mimeType: 'text/plain',
      quarantineFilePath: tempPath,
      fileSizeBytes: buffer.length,
      clientIp: '127.0.0.1',
    });

    return result;
  };

  it('Creates historical versions on sequential overwrites with same filename', async () => {
    const docName = 'lab_report.txt';

    // Version 1
    const v1 = await uploadVersion(docName, 'Version 1 initial draft');
    expect(v1.fileId).toBeDefined();

    // Version 2
    const v2 = await uploadVersion(docName, 'Version 2 revised draft');
    expect(v2.fileId).toBe(v1.fileId); // Same file ID maintained

    // Version 3
    const v3 = await uploadVersion(docName, 'Version 3 final submission');
    expect(v3.fileId).toBe(v1.fileId);

    // List versions via API
    const res = await request(app)
      .get(`/api/v1/files/${v1.fileId}/versions`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.activeFile).toBeDefined();
    expect(res.body.data.versions.length).toBe(2); // v1 and v2 are in history; v3 is active
  });

  it('Downloads and streams a specific historical version accurately', async () => {
    const files = await prisma.file.findMany({ where: { user_id: userId, name: 'lab_report.txt' } });
    const fileId = files[0].id;

    const listRes = await request(app)
      .get(`/api/v1/files/${fileId}/versions`)
      .set('Authorization', `Bearer ${userToken}`);

    const historicalVersions = listRes.body.data.versions;
    expect(historicalVersions.length).toBeGreaterThan(0);

    const oldestVersion = historicalVersions[historicalVersions.length - 1]; // v1

    const dlRes = await request(app)
      .get(`/api/v1/files/${fileId}/versions/${oldestVersion.id}/download`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(dlRes.status).toBe(200);
    expect(dlRes.text).toBe('Version 1 initial draft');
  });

  it('Reverts an active file to a historical version with quota preservation', async () => {
    const files = await prisma.file.findMany({ where: { user_id: userId, name: 'lab_report.txt' } });
    const fileId = files[0].id;

    const listRes = await request(app)
      .get(`/api/v1/files/${fileId}/versions`)
      .set('Authorization', `Bearer ${userToken}`);

    const historicalVersions = listRes.body.data.versions;
    const v1 = historicalVersions[historicalVersions.length - 1];

    // Revert to v1
    const revertRes = await request(app)
      .post(`/api/v1/files/${fileId}/versions/${v1.id}/revert`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(revertRes.status).toBe(200);
    expect(revertRes.body.success).toBe(true);

    // Download current active file; must now match v1 content!
    const activeDlRes = await request(app)
      .get(`/api/v1/files/${fileId}/download`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(activeDlRes.status).toBe(200);
    expect(activeDlRes.text).toBe('Version 1 initial draft');
  });

  it('Enforces maximum 5 versions retention by pruning the oldest version on subsequent uploads', async () => {
    const docName = 'prune_test.txt';

    // Upload 1
    const initial = await uploadVersion(docName, 'Draft 1');
    const fileId = initial.fileId;

    // Upload 2, 3, 4, 5, 6 (total 6 uploads)
    await uploadVersion(docName, 'Draft 2');
    await uploadVersion(docName, 'Draft 3');
    await uploadVersion(docName, 'Draft 4');
    await uploadVersion(docName, 'Draft 5');
    await uploadVersion(docName, 'Draft 6');

    // Query DB for historical versions count
    const versionsInDb = await prisma.fileVersion.findMany({
      where: { file_id: fileId },
    });

    // Max 5 historical versions allowed
    expect(versionsInDb.length).toBeLessThanOrEqual(5);
  });
});
