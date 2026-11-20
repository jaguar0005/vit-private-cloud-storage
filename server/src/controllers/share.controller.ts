import { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import ShareService from '../services/share.service.js';
import CryptoService from '../services/crypto.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class ShareController {
  /**
   * POST /api/v1/shares
   * Authenticated user creates a share link for one of their files
   */
  public static async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileId, password, expiresAt, maxDownloads, permission } = req.body;

      if (!fileId) {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'fileId is required.' } });
        return;
      }

      const share = await ShareService.createShare({
        userId: req.user!.id,
        fileId,
        password,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxDownloads: maxDownloads !== undefined && maxDownloads !== null ? parseInt(maxDownloads, 10) : null,
        permission,
      });

      const shareUrl = `${config.CLIENT_ORIGIN}/share/${share.token}`;

      res.status(201).json({
        success: true,
        data: {
          ...share,
          shareUrl,
        },
        message: 'Share link generated successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/shares/file/:fileId
   */
  public static async getByFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileId } = req.params;
      const shares = await ShareService.getFileShares(req.user!.id, fileId);
      res.status(200).json({ success: true, data: shares });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/shares/my
   */
  public static async getUserShares(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const shares = await ShareService.getUserShares(req.user!.id);
      res.status(200).json({ success: true, data: shares });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/shares/:id
   */
  public static async revoke(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await ShareService.revokeShare(req.user!.id, id);
      res.status(200).json({ success: true, data: updated, message: 'Share link revoked successfully.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/shares/public/:token
   * Public lookup for share link status and metadata
   */
  public static async getPublicInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      const meta = await ShareService.getPublicShareInfo(token);
      res.status(200).json({ success: true, data: meta });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        error: { code: err.code || 'SHARE_ERROR', message: err.message },
      });
    }
  }

  /**
   * GET or POST /api/v1/shares/public/:token/download
   * Streams decrypted file content to public requester
   */
  public static async downloadPublic(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      const password = (req.body?.password || req.query?.password || req.headers['x-share-password']) as string | undefined;
      const isPreview = req.query?.preview === 'true';
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      const { file, share } = await ShareService.accessShareFile(token, password, !isPreview, clientIp);

      const vaultFilePath = path.resolve(config.STORAGE_VAULT_DIR, `${file.storage_uuid}.enc`);
      if (!fs.existsSync(vaultFilePath)) {
        res.status(404).json({
          success: false,
          error: { code: 'VAULT_OBJECT_MISSING', message: 'Encrypted object missing from storage vault.' },
        });
        return;
      }

      const sanitizedName = file.name.replace(/["\r\n]/g, '_');
      const disposition = isPreview ? 'inline' : `attachment; filename="${sanitizedName}"`;

      res.setHeader('Content-Disposition', disposition);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
      res.setHeader('Content-Length', file.size_bytes.toString());

      const decryptedStream = CryptoService.createDecryptedStream(
        vaultFilePath,
        file.encrypted_dek,
        file.iv,
        file.auth_tag
      );

      decryptedStream.pipe(res);
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        error: { code: err.code || 'ACCESS_DENIED', message: err.message },
      });
    }
  }
}

export default ShareController;
