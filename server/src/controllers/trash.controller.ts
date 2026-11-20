import { Response, NextFunction } from 'express';
import TrashService from '../services/trash.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class TrashController {
  /**
   * GET /api/v1/trash
   */
  public static async listTrash(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await TrashService.getTrash(req.user!.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/trash/files/:id/restore
   */
  public static async restoreFile(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = await TrashService.restoreFile(req.user!.id, id);
      res.status(200).json({ success: true, data, message: 'File restored successfully.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/trash/folders/:id/restore
   */
  public static async restoreFolder(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = await TrashService.restoreFolder(req.user!.id, id);
      res.status(200).json({ success: true, data, message: 'Folder restored successfully.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/trash/files/:id
   */
  public static async deleteFilePermanently(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = await TrashService.permanentDeleteFile(req.user!.id, id);
      res.status(200).json({ success: true, data, message: 'File permanently deleted.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/trash/folders/:id
   */
  public static async deleteFolderPermanently(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data = await TrashService.permanentDeleteFolder(req.user!.id, id);
      res.status(200).json({ success: true, data, message: 'Folder and contents permanently deleted.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/trash/empty
   */
  public static async emptyTrash(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await TrashService.emptyTrash(req.user!.id);
      res.status(200).json({ success: true, data, message: 'Recycle Bin emptied successfully.' });
    } catch (err) {
      next(err);
    }
  }
}

export default TrashController;
