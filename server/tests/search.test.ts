import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';
import CryptoService from '../src/services/crypto.service.js';
import { TokenService } from '../src/services/token.service.js';

describe('Phase 5: Search Engine & Multi-Facet Filtering', () => {
  const app = createApp();
  let userTokenA: string;
  let userTokenB: string;
  let userAId: string;
  let userBId: string;

  beforeAll(async () => {
    // 1. Create User A
    const userA = await prisma.user.create({
      data: {
        email: `search.user.a.${Date.now()}@vit.edu`,
        role: 'STUDENT',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(0),
      },
    });
    userAId = userA.id;
    userTokenA = TokenService.generateAccessToken({ id: userA.id, email: userA.email, role: userA.role });

    // 2. Create User B (for tenant isolation test)
    const userB = await prisma.user.create({
      data: {
        email: `search.user.b.${Date.now()}@vit.edu`,
        role: 'STUDENT',
        quota_bytes: BigInt(200 * 1024 * 1024),
        used_bytes: BigInt(0),
      },
    });
    userBId = userB.id;
    userTokenB = TokenService.generateAccessToken({ id: userB.id, email: userB.email, role: userB.role });

    // Helper to store files
    const createMockFile = async (userId: string, name: string, size: number, mimeType: string, deleted = false) => {
      const storageUuid = `search-file-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const tempPath = path.resolve(config.STORAGE_QUARANTINE_DIR, `temp-${storageUuid}.txt`);
      const buffer = Buffer.alloc(size, 65);
      fs.writeFileSync(tempPath, buffer);
      const envelope = await CryptoService.encryptAndStore(tempPath, storageUuid);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

      return await prisma.file.create({
        data: {
          name,
          storage_uuid: storageUuid,
          mime_type: mimeType,
          size_bytes: BigInt(size),
          sha256_hash: envelope.sha256Hash,
          encrypted_dek: envelope.encryptedDek,
          iv: envelope.iv,
          auth_tag: envelope.authTag,
          user_id: userId,
          deleted_at: deleted ? new Date() : null,
        },
      });
    };

    // Populate User A's files
    await createMockFile(userAId, 'Cloud_Computing_Lecture_1.pdf', 1024, 'application/pdf');
    await createMockFile(userAId, 'Cloud_Architecture_Diagram.png', 2048, 'image/png');
    await createMockFile(userAId, 'Serverless_Lab_Code.py', 512, 'text/x-python');
    await createMockFile(userAId, 'Backup_Project_Archive.zip', 8192, 'application/zip');
    await createMockFile(userAId, 'Deleted_Notes.pdf', 1024, 'application/pdf', true); // trashed

    // Populate User B's file with identical name to test tenant isolation
    await createMockFile(userBId, 'Cloud_Computing_Secret_Notes.pdf', 1024, 'application/pdf');

    // Create a folder for User A
    await prisma.folder.create({
      data: {
        name: 'Cloud Computing Assignments',
        user_id: userAId,
      },
    });
  });

  afterAll(async () => {
    try {
      await prisma.file.deleteMany({ where: { user_id: { in: [userAId, userBId] } } });
      await prisma.folder.deleteMany({ where: { user_id: { in: [userAId, userBId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    } catch {
      // Ignore
    }
  });

  it('Searches files and folders by substring case-insensitively', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=cloud')
      .set('Authorization', `Bearer ${userTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const fileNames = res.body.data.files.map((f: any) => f.name);
    expect(fileNames).toContain('Cloud_Computing_Lecture_1.pdf');
    expect(fileNames).toContain('Cloud_Architecture_Diagram.png');

    // Folder matches should be returned
    const folderNames = res.body.data.folders.map((f: any) => f.name);
    expect(folderNames).toContain('Cloud Computing Assignments');

    // Deleted files must NOT appear
    expect(fileNames).not.toContain('Deleted_Notes.pdf');
  });

  it('Enforces strict tenant isolation: User A cannot discover User B files', async () => {
    const res = await request(app)
      .get('/api/v1/search?q=Secret')
      .set('Authorization', `Bearer ${userTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.files.length).toBe(0); // Cannot see User B's "Secret_Notes"
  });

  it('Filters files accurately by category (DOCUMENTS, IMAGES, ARCHIVES, CODE)', async () => {
    // Documents category
    const docRes = await request(app)
      .get('/api/v1/search?category=DOCUMENTS')
      .set('Authorization', `Bearer ${userTokenA}`);
    expect(docRes.status).toBe(200);
    expect(docRes.body.data.files.every((f: any) => f.name.endsWith('.pdf'))).toBe(true);

    // Images category
    const imgRes = await request(app)
      .get('/api/v1/search?category=IMAGES')
      .set('Authorization', `Bearer ${userTokenA}`);
    expect(imgRes.status).toBe(200);
    expect(imgRes.body.data.files.every((f: any) => f.name.endsWith('.png'))).toBe(true);

    // Code category
    const codeRes = await request(app)
      .get('/api/v1/search?category=CODE')
      .set('Authorization', `Bearer ${userTokenA}`);
    expect(codeRes.status).toBe(200);
    expect(codeRes.body.data.files.every((f: any) => f.name.endsWith('.py'))).toBe(true);
  });

  it('Filters files accurately by size boundaries (minSize & maxSize)', async () => {
    // Files between 2000 and 9000 bytes
    const res = await request(app)
      .get('/api/v1/search?minSize=2000&maxSize=9000')
      .set('Authorization', `Bearer ${userTokenA}`);

    expect(res.status).toBe(200);
    const names = res.body.data.files.map((f: any) => f.name);
    expect(names).toContain('Cloud_Architecture_Diagram.png'); // 2048 bytes
    expect(names).toContain('Backup_Project_Archive.zip'); // 8192 bytes
    expect(names).not.toContain('Serverless_Lab_Code.py'); // 512 bytes (too small)
  });
});
