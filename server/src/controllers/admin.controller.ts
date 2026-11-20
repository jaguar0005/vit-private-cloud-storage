import { Response, NextFunction } from 'express';
import AdminService from '../services/admin.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class AdminController {
  /**
   * GET /api/v1/admin/stats
   */
  public static async getStats(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await AdminService.getSystemOverview();
      res.status(200).json({ success: true, data: stats });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/users
   */
  public static async listUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const data = await AdminService.getUsers(page, limit);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/admin/users/:id/quota
   */
  public static async updateQuota(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { quotaBytes, quotaMb } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      let targetBytes: bigint;
      if (quotaBytes) {
        targetBytes = BigInt(quotaBytes);
      } else if (quotaMb) {
        targetBytes = BigInt(Math.round(Number(quotaMb) * 1024 * 1024));
      } else {
        res.status(400).json({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'Either quotaBytes or quotaMb is required.' },
        });
        return;
      }

      const updated = await AdminService.updateUserQuota(id, targetBytes, req.user!.id, clientIp);
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Student storage quota updated successfully.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/quarantine
   */
  public static async listQuarantine(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const data = await AdminService.getQuarantineLogs(page, limit);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/admin/quarantine/:id/resolve
   */
  public static async resolveQuarantine(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const updated = await AdminService.resolveQuarantineIncident(id, req.user!.id, clientIp);
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Quarantine threat marked as reviewed and resolved.',
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/audit
   */
  public static async listAudit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const action = req.query.action as string | undefined;
      const data = await AdminService.getAuditLogs(page, limit, action);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/audit/export
   */
  public static async exportAudit(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const csv = await AdminService.exportAuditCsv();
      const filename = `vit_cloud_audit_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/admin/files
   */
  public static async listAllFiles(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 50;
      const search = (req.query.q as string) || '';
      const data = await AdminService.getAllFiles(page, limit, search);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export default AdminController;
