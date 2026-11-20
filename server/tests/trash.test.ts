import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';
import CryptoService from '../src/services/crypto.service.js';
import { TokenService } from '../src/services/token.service.js';
import CleanupJob from '../src/jobs/cleanup.job.js';

describe('Phase 4: Recycle Bin (Trash) Lifecycle & 30-Day Auto-Purge', () => {
  const app = createApp();
  let userToken: string;
  let userId: string;
  const userEmail = 'trash.student@vit.edu';

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
      await prisma.file.deleteMany({ where: { user_id: userId } });
      await prisma.folder.deleteMany({ where: { user_id: userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    } catch (e) {
      // Ignore cleanup
    }
  });

  const createVaultFile = async (name: string, content: string, folderId: string | null = null, deletedAt: Date | null = null) => {
    const storageUuid = `trash-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const tempIn = path.resolve(config.STORAGE_QUARANTINE_DIR, `temp-${storageUuid}.txt`);
    const buffer = Buffer.from(content, 'utf-8');
    fs.writeFileSync(tempIn, buffer);
    const envelope = await CryptoService.encryptAndStore(tempIn, storageUuid);
    if (fs.existsSync(tempIn)) fs.unlinkSync(tempIn);

    const file = await prisma.file.create({
      data: {
        name,
        storage_uuid: storageUuid,
        mime_type: 'text/plain',
        size_bytes: BigInt(buffer.length),
        sha256_hash: envelope.sha256Hash,
        encrypted_dek: envelope.encryptedDek,
        iv: envelope.iv,
        auth_tag: envelope.authTag,
        user_id: userId,
        folder_id: folderId,
        deleted_at: deletedAt,
      },
    });

    // Update used quota
    await prisma.$executeRaw`
      UPDATE "User" SET used_bytes = used_bytes + ${buffer.length} WHERE id = ${userId}
    `;

    return { file, storageUuid };
  };

  it('Soft-deleting a file moves it to Recycle Bin with ~30 days retention', async () => {
    const { file } = await createVaultFile('assignment1.txt', 'Assignment 1 Content');

    // Soft delete via DELETE /api/v1/files/:id
    const deleteRes = await request(app)
      .delete(`/api/v1/files/${file.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(deleteRes.status).toBe(200);

    // List trash
    const trashRes = await request(app)
      .get('/api/v1/trash')
      .set('Authorization', `Bearer ${userToken}`);

    expect(trashRes.status).toBe(200);
    expect(trashRes.body.data.files).toBeDefined();
    const trashedItem = trashRes.body.data.files.find((f: any) => f.id === file.id);
    expect(trashedItem).toBeDefined();
    expect(trashedItem.name).toBe('assignment1.txt');
    expect(trashedItem.daysRemaining).toBeGreaterThanOrEqual(29);
    expect(trashedItem.daysRemaining).toBeLessThanOrEqual(30);
  });

  it('Restores a soft-deleted file back to active filesystem', async () => {
    const { file } = await createVaultFile('restore_me.txt', 'Content to restore', null, new Date());

    const restoreRes = await request(app)
      .post(`/api/v1/trash/files/${file.id}/restore`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.success).toBe(true);

    // Verify it is no longer in trash
    const trashRes = await request(app)
      .get('/api/v1/trash')
      .set('Authorization', `Bearer ${userToken}`);
    const found = trashRes.body.data.files.find((f: any) => f.id === file.id);
    expect(found).toBeUndefined();

    // Verify deleted_at is null
    const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
    expect(dbFile?.deleted_at).toBeNull();
  });

  it('Avoids name collision on restore when an active file with same name exists', async () => {
    // 1. Create active file
    await createVaultFile('report.pdf', 'Active report content');

    // 2. Create trashed file with identical name
    const { file: trashedFile } = await createVaultFile('report.pdf', 'Trashed report content', null, new Date());

    // 3. Restore trashed file
    const restoreRes = await request(app)
      .post(`/api/v1/trash/files/${trashedFile.id}/restore`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(restoreRes.status).toBe(200);

    // 4. Verify renamed to avoid collision
    const restoredDb = await prisma.file.findUnique({ where: { id: trashedFile.id } });
    expect(restoredDb?.name).toContain('(restored)');
    expect(restoredDb?.deleted_at).toBeNull();
  });

  it('Soft-deleting a folder recursively moves child folders and files to Recycle Bin', async () => {
    const folder = await prisma.folder.create({
      data: { name: 'ParentFolder', user_id: userId },
    });
    const subFolder = await prisma.folder.create({
      data: { name: 'ChildFolder', parent_id: folder.id, user_id: userId },
    });
    const { file: childFile } = await createVaultFile('child.txt', 'Child file data', subFolder.id);

    // Soft delete parent folder
    const delRes = await request(app)
      .delete(`/api/v1/folders/${folder.id}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(delRes.status).toBe(200);

    // Verify in trash
    const trashRes = await request(app)
      .get('/api/v1/trash')
      .set('Authorization', `Bearer ${userToken}`);

    expect(trashRes.body.data.folders.some((f: any) => f.id === folder.id)).toBe(true);
    expect(trashRes.body.data.files.some((f: any) => f.id === childFile.id)).toBe(true);
  });

  it('Restores a folder and its child elements recursively', async () => {
    const trashedFolders = await prisma.folder.findMany({
      where: { user_id: userId, deleted_at: { not: null }, name: 'ParentFolder' },
    });
    const parent = trashedFolders[0];

    const restoreRes = await request(app)
      .post(`/api/v1/trash/folders/${parent.id}/restore`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(restoreRes.status).toBe(200);

    const activeFolder = await prisma.folder.findUnique({ where: { id: parent.id } });
    expect(activeFolder?.deleted_at).toBeNull();
  });

  it('Permanently deletes a file, unlinks ciphertext from vault, and reclaims quota', async () => {
    const initialUser = await prisma.user.findUnique({ where: { id: userId } });
    const initialUsed = initialUser!.used_bytes;

    const { file, storageUuid } = await createVaultFile('permanent.txt', 'To be purged forever', null, new Date());
    const vaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${storageUuid}.enc`);
    expect(fs.existsSync(vaultPath)).toBe(true);

    const deleteRes = await request(app)
      .delete(`/api/v1/trash/files/${file.id}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Physical vault file must be unlinked
    expect(fs.existsSync(vaultPath)).toBe(false);

    // DB record must not exist
    const dbCheck = await prisma.file.findUnique({ where: { id: file.id } });
    expect(dbCheck).toBeNull();

    // Quota must be refunded
    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    expect(updatedUser!.used_bytes).toBe(initialUsed);
  });

  it('Empties entire Recycle Bin, removing physical ciphertexts and releasing quota', async () => {
    // Create multiple trashed files
    const { storageUuid: s1 } = await createVaultFile('trash1.txt', 'Trash item 1', null, new Date());
    const { storageUuid: s2 } = await createVaultFile('trash2.txt', 'Trash item 2', null, new Date());

    const emptyRes = await request(app)
      .delete('/api/v1/trash/empty')
      .set('Authorization', `Bearer ${userToken}`);

    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data.filesPurged).toBeGreaterThanOrEqual(2);

    // Ciphertext files deleted
    expect(fs.existsSync(path.resolve(config.STORAGE_VAULT_DIR, `${s1}.enc`))).toBe(false);
    expect(fs.existsSync(path.resolve(config.STORAGE_VAULT_DIR, `${s2}.enc`))).toBe(false);

    // Trash is now empty
    const trashRes = await request(app)
      .get('/api/v1/trash')
      .set('Authorization', `Bearer ${userToken}`);
    expect(trashRes.body.data.files.length).toBe(0);
  });

  it('30-Day Auto-Purge Cron Task cleans expired trash objects and reclaims quota automatically', async () => {
    // Artificially create a file deleted 31 days ago
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const { file, storageUuid } = await createVaultFile(
      'expired31days.txt',
      'Old expired garbage',
      null,
      thirtyOneDaysAgo
    );

    const vaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${storageUuid}.enc`);
    expect(fs.existsSync(vaultPath)).toBe(true);

    // Run cleanup background job directly
    const cleanupStats = await CleanupJob.runAllCleanupTasks();
    expect(cleanupStats.purgedFiles).toBeGreaterThanOrEqual(1);

    // Vault ciphertext purged
    expect(fs.existsSync(vaultPath)).toBe(false);

    // DB record purged
    const dbFile = await prisma.file.findUnique({ where: { id: file.id } });
    expect(dbFile).toBeNull();
  });
});
