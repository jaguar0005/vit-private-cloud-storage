import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';
import { SharePermission } from '@prisma/client';

export interface CreateShareInput {
  userId: string;
  fileId: string;
  password?: string;
  expiresAt?: Date | null;
  maxDownloads?: number | null;
  permission?: SharePermission;
}

export class ShareService {
  /**
   * Generates a new cryptographically secure share link for a file
   */
  public static async createShare(input: CreateShareInput) {
    const { userId, fileId, password, expiresAt, maxDownloads, permission = SharePermission.DOWNLOAD } = input;

    // Verify file exists, belongs to user, and is not trashed
    const file = await prisma.file.findFirst({
      where: {
        id: fileId,
        user_id: userId,
        deleted_at: null,
      },
    });

    if (!file) {
      const err = new Error('File not found or has been moved to Recycle Bin.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (expiresAt && new Date(expiresAt) <= new Date()) {
      const err = new Error('Expiration date must be in the future.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (maxDownloads !== undefined && maxDownloads !== null && maxDownloads <= 0) {
      const err = new Error('Maximum downloads must be greater than zero.');
      (err as any).statusCode = 400;
      throw err;
    }

    // Generate 192-bit secure random token (URL-safe base64)
    const token = crypto.randomBytes(24).toString('base64url');

    // Hash password if supplied
    let passwordHash: string | null = null;
    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    const share = await prisma.shareLink.create({
      data: {
        file_id: fileId,
        user_id: userId,
        token,
        password_hash: passwordHash,
        expires_at: expiresAt ? new Date(expiresAt) : null,
        max_downloads: maxDownloads || null,
        permission,
        is_active: true,
      },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size_bytes: true,
            mime_type: true,
          },
        },
      },
    });

    // Record audit log
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: 'SHARE_CREATE',
        resource_id: fileId,
        details: {
          shareId: share.id,
          token,
          hasPassword: !!passwordHash,
          expiresAt: share.expires_at,
          maxDownloads: share.max_downloads,
          permission,
        },
      },
    });

    return {
      ...share,
      file: {
        ...share.file,
        size_bytes: share.file.size_bytes.toString(),
      },
    };
  }

  /**
   * Retrieves all active share links created by the user for a specific file
   */
  public static async getFileShares(userId: string, fileId: string) {
    return await prisma.shareLink.findMany({
      where: {
        file_id: fileId,
        user_id: userId,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Retrieves all active share links for the user across all files
   */
  public static async getUserShares(userId: string) {
    const shares = await prisma.shareLink.findMany({
      where: { user_id: userId },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            size_bytes: true,
            mime_type: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return shares.map((s) => ({
      ...s,
      file: {
        ...s.file,
        size_bytes: s.file.size_bytes.toString(),
      },
    }));
  }

  /**
   * Revokes (deactivates) a share link
   */
  public static async revokeShare(userId: string, shareId: string) {
    const share = await prisma.shareLink.findFirst({
      where: { id: shareId, user_id: userId },
    });

    if (!share) {
      const err = new Error('Share link not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const updated = await prisma.shareLink.update({
      where: { id: shareId },
      data: { is_active: false },
    });

    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: 'SHARE_REVOKE',
        resource_id: share.file_id,
        details: { shareId },
      },
    });

    return updated;
  }

  /**
   * Public metadata lookup: returns non-sensitive file info if share is valid
   */
  public static async getPublicShareInfo(token: string) {
    const share = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        file: true,
      },
    });

    if (!share) {
      const err = new Error('This share link does not exist.');
      (err as any).statusCode = 404;
      (err as any).code = 'SHARE_NOT_FOUND';
      throw err;
    }

    if (share.file.deleted_at !== null) {
      const err = new Error('The shared file is no longer available.');
      (err as any).statusCode = 410;
      (err as any).code = 'FILE_DELETED';
      throw err;
    }

    if (share.expires_at && new Date() > share.expires_at) {
      const err = new Error('This share link has expired.');
      (err as any).statusCode = 410;
      (err as any).code = 'SHARE_EXPIRED';
      throw err;
    }

    if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
      const err = new Error('The maximum download limit for this link has been reached.');
      (err as any).statusCode = 410;
      (err as any).code = 'DOWNLOAD_LIMIT_REACHED';
      throw err;
    }

    if (!share.is_active) {
      const err = new Error('This share link has been disabled.');
      (err as any).statusCode = 404;
      (err as any).code = 'SHARE_NOT_FOUND';
      throw err;
    }

    return {
      token: share.token,
      fileName: share.file.name,
      fileSize: share.file.size_bytes.toString(),
      mimeType: share.file.mime_type,
      permission: share.permission,
      isPasswordProtected: share.password_hash !== null,
      expiresAt: share.expires_at,
      maxDownloads: share.max_downloads,
      downloadCount: share.download_count,
      createdAt: share.created_at,
    };
  }

  /**
   * Validates access and increments download count if eligible
   */
  public static async accessShareFile(token: string, password?: string, isDownload = true, clientIp = '127.0.0.1') {
    const share = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        file: true,
      },
    });

    if (!share) {
      const err = new Error('This share link does not exist.');
      (err as any).statusCode = 404;
      (err as any).code = 'SHARE_NOT_FOUND';
      throw err;
    }

    if (share.file.deleted_at !== null) {
      const err = new Error('The shared file is no longer available.');
      (err as any).statusCode = 410;
      (err as any).code = 'FILE_DELETED';
      throw err;
    }

    if (share.expires_at && new Date() > share.expires_at) {
      const err = new Error('This share link has expired.');
      (err as any).statusCode = 410;
      (err as any).code = 'SHARE_EXPIRED';
      throw err;
    }

    if (share.max_downloads !== null && share.download_count >= share.max_downloads) {
      const err = new Error('The maximum download limit for this link has been reached.');
      (err as any).statusCode = 410;
      (err as any).code = 'DOWNLOAD_LIMIT_REACHED';
      throw err;
    }

    if (!share.is_active) {
      const err = new Error('This share link has been disabled.');
      (err as any).statusCode = 404;
      (err as any).code = 'SHARE_NOT_FOUND';
      throw err;
    }

    // Password verification
    if (share.password_hash) {
      if (!password) {
        const err = new Error('Password required to access this file.');
        (err as any).statusCode = 401;
        (err as any).code = 'PASSWORD_REQUIRED';
        throw err;
      }

      const match = await bcrypt.compare(password, share.password_hash);
      if (!match) {
        const err = new Error('Invalid passcode entered.');
        (err as any).statusCode = 401;
        (err as any).code = 'INVALID_PASSWORD';
        throw err;
      }
    }

    // If permission is VIEW_ONLY and user requested download, reject
    if (isDownload && share.permission === SharePermission.VIEW_ONLY) {
      const err = new Error('This share link is view-only; downloading is disabled.');
      (err as any).statusCode = 403;
      (err as any).code = 'VIEW_ONLY';
      throw err;
    }

    // Atomically increment download count if download was requested
    let updatedShare = share;
    if (isDownload) {
      const willBeMaxed = share.max_downloads !== null && share.download_count + 1 >= share.max_downloads;
      updatedShare = await prisma.shareLink.update({
        where: { id: share.id },
        data: {
          download_count: { increment: 1 },
          ...(willBeMaxed ? { is_active: false } : {}),
        },
        include: { file: true },
      });
    }

    // Log public access
    await prisma.auditLog.create({
      data: {
        user_id: share.user_id,
        action: isDownload ? 'SHARE_DOWNLOAD' : 'SHARE_VIEW',
        resource_id: share.file_id,
        ip_address: clientIp,
        details: {
          token,
          downloadCount: updatedShare.download_count,
          maxDownloads: updatedShare.max_downloads,
        },
      },
    });

    return {
      file: share.file,
      share: updatedShare,
    };
  }
}

export default ShareService;
