import fs from 'node:fs';
import path from 'node:path';
import prisma from '../db/prisma.js';
import config from '../config/index.js';
import QuotaService from './quota.service.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export class TrashService {
  /**
   * Returns all soft-deleted files and folders for a user
   */
  public static async getTrash(userId: string) {
    const [files, folders] = await Promise.all([
      prisma.file.findMany({
        where: { user_id: userId, deleted_at: { not: null } },
        orderBy: { deleted_at: 'desc' },
      }),
      prisma.folder.findMany({
        where: { user_id: userId, deleted_at: { not: null } },
        orderBy: { deleted_at: 'desc' },
      }),
    ]);

    const now = Date.now();

    const formattedFiles = files.map((f) => {
      const deletedAt = f.deleted_at!.getTime();
      const expiresAt = new Date(deletedAt + THIRTY_DAYS_MS);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)));

      return {
        id: f.id,
        name: f.name,
        type: 'file' as const,
        sizeBytes: f.size_bytes.toString(),
        mimeType: f.mime_type,
        deletedAt: f.deleted_at,
        expiresAt,
        daysRemaining,
      };
    });

    const formattedFolders = folders.map((f) => {
      const deletedAt = f.deleted_at!.getTime();
      const expiresAt = new Date(deletedAt + THIRTY_DAYS_MS);
      const daysRemaining = Math.max(0, Math.ceil((expiresAt.getTime() - now) / (1000 * 60 * 60 * 24)));

      return {
        id: f.id,
        name: f.name,
        type: 'folder' as const,
        deletedAt: f.deleted_at,
        expiresAt,
        daysRemaining,
      };
    });

    return {
      files: formattedFiles,
      folders: formattedFolders,
      totalCount: formattedFiles.length + formattedFolders.length,
    };
  }

  /**
   * Restores a soft-deleted file, handling parent existence and name collisions
   */
  public static async restoreFile(userId: string, fileId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, user_id: userId, deleted_at: { not: null } },
    });

    if (!file) {
      const err = new Error('File not found in Recycle Bin.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Verify parent folder exists and is active; if trashed or missing, restore to root
    let targetFolderId = file.folder_id;
    if (targetFolderId) {
      const parentFolder = await prisma.folder.findFirst({
        where: { id: targetFolderId, user_id: userId, deleted_at: null },
      });
      if (!parentFolder) {
        targetFolderId = null;
      }
    }

    // Handle name collision in destination
    let finalName = file.name;
    const existingActive = await prisma.file.findFirst({
      where: {
        user_id: userId,
        folder_id: targetFolderId,
        name: finalName,
        deleted_at: null,
      },
    });

    if (existingActive) {
      const parsed = path.parse(finalName);
      finalName = `${parsed.name} (restored)${parsed.ext}`;
    }

    const restored = await prisma.file.update({
      where: { id: fileId },
      data: {
        deleted_at: null,
        folder_id: targetFolderId,
        name: finalName,
      },
    });

    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: 'FILE_RESTORE',
        resource_id: fileId,
        details: { originalName: file.name, restoredName: finalName },
      },
    });

    return restored;
  }

  /**
   * Restores a soft-deleted folder and its child elements
   */
  public static async restoreFolder(userId: string, folderId: string) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, user_id: userId, deleted_at: { not: null } },
    });

    if (!folder) {
      const err = new Error('Folder not found in Recycle Bin.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Verify parent folder is active; if not, restore to root
    let targetParentId = folder.parent_id;
    if (targetParentId) {
      const parentFolder = await prisma.folder.findFirst({
        where: { id: targetParentId, user_id: userId, deleted_at: null },
      });
      if (!parentFolder) {
        targetParentId = null;
      }
    }

    // Handle folder name collision
    let finalName = folder.name;
    const existingFolder = await prisma.folder.findFirst({
      where: {
        user_id: userId,
        parent_id: targetParentId,
        name: finalName,
        deleted_at: null,
      },
    });

    if (existingFolder) {
      finalName = `${finalName} (restored)`;
    }

    // Find all nested descendants that were soft-deleted
    const getAllDescendantIds = async (id: string): Promise<string[]> => {
      const children = await prisma.folder.findMany({
        where: { parent_id: id, user_id: userId },
        select: { id: true },
      });
      let ids: string[] = [];
      for (const c of children) {
        ids.push(c.id);
        const nested = await getAllDescendantIds(c.id);
        ids = ids.concat(nested);
      }
      return ids;
    };

    const allFolderIds = [folderId, ...(await getAllDescendantIds(folderId))];

    await prisma.$transaction([
      prisma.folder.update({
        where: { id: folderId },
        data: {
          deleted_at: null,
          parent_id: targetParentId,
          name: finalName,
        },
      }),
      prisma.folder.updateMany({
        where: { id: { in: allFolderIds.filter((id) => id !== folderId) } },
        data: { deleted_at: null },
      }),
      prisma.file.updateMany({
        where: { folder_id: { in: allFolderIds } },
        data: { deleted_at: null },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: 'FOLDER_RESTORE',
        resource_id: folderId,
        details: { folderName: finalName },
      },
    });

    return { success: true, restoredFolderId: folderId };
  }

  /**
   * Permanently deletes a file from disk and database, releasing user quota
   */
  public static async permanentDeleteFile(userId: string, fileId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, user_id: userId },
      include: { versions: true },
    });

    if (!file) {
      const err = new Error('File not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Calculate total bytes across active file and all versions
    let totalBytes = file.size_bytes;
    for (const v of file.versions) {
      totalBytes += v.size_bytes;
    }

    // Remove encrypted files from disk
    const activeVaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${file.storage_uuid}.enc`);
    if (fs.existsSync(activeVaultPath)) {
      try {
        fs.unlinkSync(activeVaultPath);
      } catch (e) {
        console.error(`Failed to unlink file ${activeVaultPath}:`, e);
      }
    }

    for (const v of file.versions) {
      const vPath = path.resolve(config.STORAGE_VAULT_DIR, `${v.storage_uuid}.enc`);
      if (fs.existsSync(vPath)) {
        try {
          fs.unlinkSync(vPath);
        } catch (e) {
          console.error(`Failed to unlink version ${vPath}:`, e);
        }
      }
    }

    // Delete DB record and release quota
    await prisma.$transaction(async (tx) => {
      await tx.file.delete({ where: { id: fileId } });
      await QuotaService.releaseQuota(userId, totalBytes, tx);
      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: 'FILE_PERMANENT_DELETE',
          resource_id: fileId,
          details: { name: file.name, totalBytesReleased: totalBytes.toString() },
        },
      });
    });

    return { success: true, fileId, totalBytesReleased: totalBytes.toString() };
  }

  /**
   * Permanently deletes a folder and all nested files and subfolders
   */
  public static async permanentDeleteFolder(userId: string, folderId: string) {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, user_id: userId },
    });

    if (!folder) {
      const err = new Error('Folder not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const getAllDescendantIds = async (id: string): Promise<string[]> => {
      const children = await prisma.folder.findMany({
        where: { parent_id: id, user_id: userId },
        select: { id: true },
      });
      let ids: string[] = [];
      for (const c of children) {
        ids.push(c.id);
        const nested = await getAllDescendantIds(c.id);
        ids = ids.concat(nested);
      }
      return ids;
    };

    const allFolderIds = [folderId, ...(await getAllDescendantIds(folderId))];

    // Find all files in these folders
    const files = await prisma.file.findMany({
      where: { folder_id: { in: allFolderIds }, user_id: userId },
      include: { versions: true },
    });

    let totalBytesToRelease = BigInt(0);

    for (const f of files) {
      totalBytesToRelease += f.size_bytes;
      const activePath = path.resolve(config.STORAGE_VAULT_DIR, `${f.storage_uuid}.enc`);
      if (fs.existsSync(activePath)) {
        try {
          fs.unlinkSync(activePath);
        } catch (e) {
          console.error(`Failed to unlink file ${activePath}:`, e);
        }
      }

      for (const v of f.versions) {
        totalBytesToRelease += v.size_bytes;
        const vPath = path.resolve(config.STORAGE_VAULT_DIR, `${v.storage_uuid}.enc`);
        if (fs.existsSync(vPath)) {
          try {
            fs.unlinkSync(vPath);
          } catch (e) {
            console.error(`Failed to unlink version ${vPath}:`, e);
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.file.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
      await tx.folder.deleteMany({ where: { id: { in: allFolderIds } } });
      if (totalBytesToRelease > BigInt(0)) {
        await QuotaService.releaseQuota(userId, totalBytesToRelease, tx);
      }
      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: 'FOLDER_PERMANENT_DELETE',
          resource_id: folderId,
          details: {
            folderName: folder.name,
            totalFilesDeleted: files.length,
            totalBytesReleased: totalBytesToRelease.toString(),
          },
        },
      });
    });

    return {
      success: true,
      folderId,
      filesDeleted: files.length,
      bytesReleased: totalBytesToRelease.toString(),
    };
  }

  /**
   * Empties the entire Recycle Bin for a user
   */
  public static async emptyTrash(userId: string) {
    const trashedFiles = await prisma.file.findMany({
      where: { user_id: userId, deleted_at: { not: null } },
      include: { versions: true },
    });

    const trashedFolders = await prisma.folder.findMany({
      where: { user_id: userId, deleted_at: { not: null } },
    });

    let totalBytes = BigInt(0);

    for (const f of trashedFiles) {
      totalBytes += f.size_bytes;
      const activePath = path.resolve(config.STORAGE_VAULT_DIR, `${f.storage_uuid}.enc`);
      if (fs.existsSync(activePath)) {
        try {
          fs.unlinkSync(activePath);
        } catch (e) {
          console.error(`Failed to unlink file ${activePath}:`, e);
        }
      }

      for (const v of f.versions) {
        totalBytes += v.size_bytes;
        const vPath = path.resolve(config.STORAGE_VAULT_DIR, `${v.storage_uuid}.enc`);
        if (fs.existsSync(vPath)) {
          try {
            fs.unlinkSync(vPath);
          } catch (e) {
            console.error(`Failed to unlink version ${vPath}:`, e);
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.file.deleteMany({
        where: { id: { in: trashedFiles.map((f) => f.id) } },
      });
      await tx.folder.deleteMany({
        where: { id: { in: trashedFolders.map((f) => f.id) } },
      });
      if (totalBytes > BigInt(0)) {
        await QuotaService.releaseQuota(userId, totalBytes, tx);
      }
      await tx.auditLog.create({
        data: {
          user_id: userId,
          action: 'TRASH_EMPTY',
          details: {
            filesPurged: trashedFiles.length,
            foldersPurged: trashedFolders.length,
            bytesReleased: totalBytes.toString(),
          },
        },
      });
    });

    return {
      success: true,
      filesPurged: trashedFiles.length,
      foldersPurged: trashedFolders.length,
      bytesReleased: totalBytes.toString(),
    };
  }
}

export default TrashService;
