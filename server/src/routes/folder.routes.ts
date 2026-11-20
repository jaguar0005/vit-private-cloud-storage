import { Router } from 'express';
import { FolderController } from '../controllers/folder.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// All folder endpoints require valid authentication
router.use(requireAuth);

router.get('/contents', FolderController.listContents);
router.post('/', FolderController.create);
router.patch('/:id/rename', FolderController.rename);
router.patch('/:id/move', FolderController.move);
router.delete('/:id', FolderController.delete);

export default router;
