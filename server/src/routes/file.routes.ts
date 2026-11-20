import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller.js';
import { VersionController } from '../controllers/version.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// All file routes require authentication
router.use(requireAuth);

router.post('/upload', UploadController.uploadDirect);
router.post('/upload/chunk', UploadController.uploadChunk);
router.get('/:id/download', UploadController.download);
router.patch('/:id/rename', UploadController.rename);
router.patch('/:id/move', UploadController.move);
router.delete('/:id', UploadController.softDelete);

// Version history routes
router.get('/:fileId/versions', VersionController.listVersions);
router.get('/:fileId/versions/:versionId/download', VersionController.downloadVersion);
router.post('/:fileId/versions/:versionId/revert', VersionController.revertVersion);

export default router;
