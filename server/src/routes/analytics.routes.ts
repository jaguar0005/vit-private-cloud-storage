import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);
router.get('/me', AnalyticsController.getMyAnalytics);
router.get('/pool', AnalyticsController.getPoolAnalytics);

export default router;
