import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';

const router = Router();

// All admin routes strictly enforce authentication and ADMIN role
router.use(requireAuth);
router.use(requireAdmin);

router.get('/stats', AdminController.getStats);
router.get('/users', AdminController.listUsers);
router.patch('/users/:id/quota', AdminController.updateQuota);
router.get('/quarantine', AdminController.listQuarantine);
router.patch('/quarantine/:id/resolve', AdminController.resolveQuarantine);
router.get('/audit', AdminController.listAudit);
router.get('/audit/export', AdminController.exportAudit);

export default router;
