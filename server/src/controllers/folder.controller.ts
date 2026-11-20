import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { FolderService } from '../services/folder.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

const createFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(255),
  parentId: z.string().uuid().nullable().optional(),
});

const renameFolderSchema = z.object({
  name: z.string().min(1, 'New name is required').max(255),
});

const moveFolderSchema = z.object({
  targetParentId: z.string().uuid().nullable().optional(),
});

export class FolderController {
  public static async listContents(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const folderId = (req.query.folderId as string) || null;
      const contents = await FolderService.listContents(req.user!.id, folderId);

      res.status(200).json({
        success: true,
        data: contents,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async create(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validation = createFolderSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0]?.message || 'Invalid input.',
          },
        });
        return;
      }

      const folder = await FolderService.createFolder(
        req.user!.id,
        validation.data.name,
        validation.data.parentId
      );

      res.status(201).json({
        success: true,
        data: folder,
        message: 'Folder created successfully.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create folder.';
      res.status(400).json({
        success: false,
        error: { code: 'FOLDER_CREATE_FAILED', message },
      });
    }
  }

  public static async rename(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validation = renameFolderSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validation.error.errors[0]?.message },
        });
        return;
      }

      const folder = await FolderService.renameFolder(req.user!.id, id, validation.data.name);

      res.status(200).json({
        success: true,
        data: folder,
        message: 'Folder renamed successfully.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to rename folder.';
      res.status(400).json({
        success: false,
        error: { code: 'FOLDER_RENAME_FAILED', message },
      });
    }
  }

  public static async move(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const validation = moveFolderSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validation.error.errors[0]?.message },
        });
        return;
      }

      const folder = await FolderService.moveFolder(req.user!.id, id, validation.data.targetParentId);

      res.status(200).json({
        success: true,
        data: folder,
        message: 'Folder moved successfully.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to move folder.';
      res.status(400).json({
        success: false,
        error: { code: 'FOLDER_MOVE_FAILED', message },
      });
    }
  }

  public static async delete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await FolderService.softDeleteFolder(req.user!.id, id);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Folder and contents moved to Recycle Bin.',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete folder.';
      res.status(400).json({
        success: false,
        error: { code: 'FOLDER_DELETE_FAILED', message },
      });
    }
  }
}

export default FolderController;
