import { Router } from 'express';
import { SearchController } from '../controllers/search.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);
router.get('/', SearchController.search);

export default router;
