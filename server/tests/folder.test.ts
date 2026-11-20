import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/db/prisma.js';
import { FolderService } from '../src/services/folder.service.js';
import { ensureDatabaseAvailable } from '../src/db/embeddedPg.js';

describe('Phase 2: Hierarchical Folder Management & Breadcrumbs', () => {
  let userId: string;

  beforeAll(async () => {
    await ensureDatabaseAvailable();

    const user = await prisma.user.upsert({
      where: { email: 'folder.tester@vit.edu' },
      update: {},
      create: {
        email: 'folder.tester@vit.edu',
        role: 'STUDENT',
      },
    });

    userId = user.id;
  });

  afterAll(async () => {
    await prisma.folder.deleteMany({ where: { user_id: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  it('Creates root and nested folders successfully', async () => {
    const rootFolder = await FolderService.createFolder(userId, 'Semester 5');
    expect(rootFolder.id).toBeDefined();
    expect(rootFolder.parent_id).toBeNull();

    const subFolder = await FolderService.createFolder(userId, 'Cloud Computing', rootFolder.id);
    expect(subFolder.id).toBeDefined();
    expect(subFolder.parent_id).toBe(rootFolder.id);
  });

  it('Prevents duplicate folder names in the same directory', async () => {
    await expect(
      FolderService.createFolder(userId, 'Semester 5')
    ).rejects.toThrow(/already exists/i);
  });

  it('Generates ordered breadcrumb trail from root to leaf', async () => {
    const root = await prisma.folder.findFirst({
      where: { user_id: userId, name: 'Semester 5' },
    });
    const sub = await prisma.folder.findFirst({
      where: { user_id: userId, name: 'Cloud Computing' },
    });

    const breadcrumbs = await FolderService.getBreadcrumbs(userId, sub?.id);
    expect(breadcrumbs).toHaveLength(3);
    expect(breadcrumbs[0]).toEqual({ id: null, name: 'Home' });
    expect(breadcrumbs[1]).toEqual({ id: root?.id, name: 'Semester 5' });
    expect(breadcrumbs[2]).toEqual({ id: sub?.id, name: 'Cloud Computing' });
  });

  it('Prevents circular folder movements (moving parent into child)', async () => {
    const root = await prisma.folder.findFirst({
      where: { user_id: userId, name: 'Semester 5' },
    });
    const sub = await prisma.folder.findFirst({
      where: { user_id: userId, name: 'Cloud Computing' },
    });

    // Attempting to move Semester 5 into its own child Cloud Computing
    await expect(
      FolderService.moveFolder(userId, root!.id, sub!.id)
    ).rejects.toThrow(/Circular operation/i);
  });

  it('Soft-deletes folder and recursively cascades to all children', async () => {
    const root = await prisma.folder.findFirst({
      where: { user_id: userId, name: 'Semester 5' },
    });

    await FolderService.softDeleteFolder(userId, root!.id);

    const rootCheck = await prisma.folder.findUnique({ where: { id: root!.id } });
    expect(rootCheck?.deleted_at).not.toBeNull();

    const subCheck = await prisma.folder.findFirst({ where: { parent_id: root!.id } });
    expect(subCheck?.deleted_at).not.toBeNull();
  });
});
