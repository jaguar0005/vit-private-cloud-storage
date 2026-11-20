import { Router } from 'express';
import { TrashController } from '../controllers/trash.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// All trash actions require authentication
router.use(requireAuth);

router.get('/', TrashController.listTrash);
router.post('/files/:id/restore', TrashController.restoreFile);
router.post('/folders/:id/restore', TrashController.restoreFolder);
router.delete('/files/:id', TrashController.deleteFilePermanently);
router.delete('/folders/:id', TrashController.deleteFolderPermanently);
router.delete('/empty', TrashController.emptyTrash);

export default router;
