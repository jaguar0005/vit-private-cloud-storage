import prisma from '../db/prisma.js';

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export class FolderService {
  /**
   * Sanitizes folder name to prevent filesystem traversal characters and illegal symbols
   */
  public static sanitizeFolderName(name: string): string {
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, '');
    if (!clean || clean === '.' || clean === '..') {
      throw new Error('Invalid folder name.');
    }
    if (clean.length > 255) {
      throw new Error('Folder name cannot exceed 255 characters.');
    }
    return clean;
  }

  /**
   * Creates a new folder inside an optional parent directory
   */
  public static async createFolder(userId: string, name: string, parentId?: string | null) {
    const cleanName = this.sanitizeFolderName(name);

    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: { id: parentId, user_id: userId, deleted_at: null },
      });
      if (!parent) {
        throw new Error('Parent folder does not exist or has been deleted.');
      }
    }

    // Check name conflict in the same directory
    const existing = await prisma.folder.findFirst({
      where: {
        user_id: userId,
        parent_id: parentId || null,
        name: cleanName,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new Error(`A folder named "${cleanName}" already exists in this location.`);
    }

    return await prisma.folder.create({
      data: {
        name: cleanName,
        parent_id: parentId || null,
        user_id: userId,
      },
    });
  }

  /**
   * Renames an existing folder
   */
  public static async renameFolder(userId: string, folderId: string, newName: string) {
    const cleanName = this.sanitizeFolderName(newName);

    const folder = await prisma.folder.findFirst({
      where: { id: folderId, user_id: userId, deleted_at: null },
    });

    if (!folder) {
      throw new Error('Folder not found.');
    }

    // Check name collision in the parent directory
    const collision = await prisma.folder.findFirst({
      where: {
        user_id: userId,
        parent_id: folder.parent_id,
        name: cleanName,
        deleted_at: null,
        id: { not: folderId },
      },
    });

    if (collision) {
      throw new Error(`A folder named "${cleanName}" already exists in this location.`);
    }

    return await prisma.folder.update({
      where: { id: folderId },
      data: { name: cleanName },
    });
  }

  /**
   * Checks if targetId is an ancestor or identical to folderId to prevent circular dependency loops
   */
  private static async isDescendant(userId: string, folderId: string, targetId: string): Promise<boolean> {
    if (folderId === targetId) return true;

    let currentId: string | null = targetId;

    while (currentId) {
      const parent: { parent_id: string | null } | null = await prisma.folder.findFirst({
        where: { id: currentId, user_id: userId },
        select: { parent_id: true },
      });

      if (!parent) break;
      if (parent.parent_id === folderId) return true;
      currentId = parent.parent_id;
    }

    return false;
  }

  /**
   * Moves a folder into a new parent, with circular reference guardrails
   */
  public static async moveFolder(userId: string, folderId: string, targetParentId?: string | null) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, user_id: userId, deleted_at: null },
    });

    if (!folder) {
      throw new Error('Folder not found.');
    }

    if (targetParentId) {
      // Prevent circular movement: folder cannot be moved into itself or its descendants
      const isLoop = await this.isDescendant(userId, folderId, targetParentId);
      if (isLoop) {
        throw new Error('Circular operation: A folder cannot be moved inside itself or one of its subfolders.');
      }

      const targetParent = await prisma.folder.findFirst({
        where: { id: targetParentId, user_id: userId, deleted_at: null },
      });

      if (!targetParent) {
        throw new Error('Target folder not found.');
      }
    }

    return await prisma.folder.update({
      where: { id: folderId },
      data: { parent_id: targetParentId || null },
    });
  }

  /**
   * Soft-deletes a folder and recursively marks all child folders and files to Recycle Bin
   */
  public static async softDeleteFolder(userId: string, folderId: string) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, user_id: userId, deleted_at: null },
    });

    if (!folder) {
      throw new Error('Folder not found.');
    }

    const now = new Date();

    // Recursive helper to find all descendant folder IDs
    const getAllDescendantIds = async (id: string): Promise<string[]> => {
      const children = await prisma.folder.findMany({
        where: { parent_id: id, user_id: userId, deleted_at: null },
        select: { id: true },
      });

      let ids: string[] = [];
      for (const child of children) {
        ids.push(child.id);
        const nested = await getAllDescendantIds(child.id);
        ids = ids.concat(nested);
      }
      return ids;
    };

    const allFolderIds = [folderId, ...(await getAllDescendantIds(folderId))];

    await prisma.$transaction([
      prisma.folder.updateMany({
        where: { id: { in: allFolderIds } },
        data: { deleted_at: now },
      }),
      prisma.file.updateMany({
        where: { folder_id: { in: allFolderIds }, deleted_at: null },
        data: { deleted_at: now },
      }),
    ]);

    return { success: true, deletedFolderIds: allFolderIds };
  }

  /**
   * Generates breadcrumb navigation trail from root to the given folder
   */
  public static async getBreadcrumbs(userId: string, folderId?: string | null): Promise<BreadcrumbItem[]> {
    const breadcrumbs: BreadcrumbItem[] = [{ id: null, name: 'Home' }];

    if (!folderId) {
      return breadcrumbs;
    }

    const trail: BreadcrumbItem[] = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const folder: { id: string; name: string; parent_id: string | null } | null = await prisma.folder.findFirst({
        where: { id: currentId, user_id: userId },
        select: { id: true, name: true, parent_id: true },
      });

      if (!folder) break;

      trail.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parent_id;
    }

    return [...breadcrumbs, ...trail];
  }

  /**
   * Lists active subfolders and files inside a specific directory
   */
  public static async listContents(userId: string, folderId?: string | null) {
    const [folders, files] = await Promise.all([
      prisma.folder.findMany({
        where: {
          user_id: userId,
          parent_id: folderId || null,
          deleted_at: null,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.file.findMany({
        where: {
          user_id: userId,
          folder_id: folderId || null,
          deleted_at: null,
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);

    const breadcrumbs = await this.getBreadcrumbs(userId, folderId);

    return {
      currentFolderId: folderId || null,
      breadcrumbs,
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parent_id,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
      files: files.map((f) => ({
        id: f.id,
        name: f.name,
        storageUuid: f.storage_uuid,
        mimeType: f.mime_type,
        sizeBytes: Number(f.size_bytes),
        sha256Hash: f.sha256_hash,
        folderId: f.folder_id,
        isStarred: f.is_starred,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
    };
  }
}

export default FolderService;
