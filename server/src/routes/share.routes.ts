import { Router } from 'express';
import { ShareController } from '../controllers/share.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Public routes (no authentication required)
router.get('/public/:token', ShareController.getPublicInfo);
router.get('/public/:token/download', ShareController.downloadPublic);
router.post('/public/:token/download', ShareController.downloadPublic);

// Authenticated routes (institutional user required)
router.post('/', requireAuth, ShareController.create);
router.get('/my', requireAuth, ShareController.getUserShares);
router.get('/file/:fileId', requireAuth, ShareController.getByFile);
router.delete('/:id', requireAuth, ShareController.revoke);

export default router;
