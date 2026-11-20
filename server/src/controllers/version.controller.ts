import { Response, NextFunction } from 'express';
import VersionService from '../services/version.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class VersionController {
  /**
   * GET /api/v1/files/:fileId/versions
   */
  public static async listVersions(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileId } = req.params;
      const data = await VersionService.getVersions(req.user!.id, fileId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/files/:fileId/versions/:versionId/download
   */
  public static async downloadVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileId, versionId } = req.params;
      const { stream, fileName, mimeType, sizeBytes } = await VersionService.streamVersion(
        req.user!.id,
        fileId,
        versionId
      );

      const sanitizedName = fileName.replace(/["\r\n]/g, '_');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Type', mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', sizeBytes);

      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/files/:fileId/versions/:versionId/revert
   */
  public static async revertVersion(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { fileId, versionId } = req.params;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      const reverted = await VersionService.revertVersion(req.user!.id, fileId, versionId, clientIp);

      res.status(200).json({
        success: true,
        data: reverted,
        message: 'File successfully reverted to historical version.',
      });
    } catch (err) {
      next(err);
    }
  }
}

export default VersionController;
