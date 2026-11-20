import { Response, NextFunction } from 'express';
import AnalyticsService from '../services/analytics.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class AnalyticsController {
  /**
   * GET /api/v1/analytics/me
   */
  public static async getMyAnalytics(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AnalyticsService.getUserAnalytics(req.user!.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/analytics/pool
   */
  public static async getPoolAnalytics(_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await AnalyticsService.getGlobalPoolAnalytics();
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}

export default AnalyticsController;
