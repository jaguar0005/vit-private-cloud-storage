import { Response, NextFunction } from 'express';
import SearchService, { SearchFilters } from '../services/search.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class SearchController {
  /**
   * GET /api/v1/search
   */
  public static async search(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        q,
        category,
        minSize,
        maxSize,
        startDate,
        endDate,
      } = req.query;

      const filters: SearchFilters = {
        query: typeof q === 'string' ? q : undefined,
        category: typeof category === 'string' ? (category as any) : 'ALL',
        minSizeBytes: minSize ? parseInt(minSize as string, 10) : undefined,
        maxSizeBytes: maxSize ? parseInt(maxSize as string, 10) : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
      };

      const results = await SearchService.searchUserFiles(req.user!.id, filters);
      res.status(200).json({ success: true, data: results });
    } catch (err) {
      next(err);
    }
  }
}

export default SearchController;
