import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { otpRequestLimiter, otpVerifyLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

router.post('/request-otp', otpRequestLimiter, AuthController.requestOtp);
router.post('/verify-otp', otpVerifyLimiter, AuthController.verifyOtp);
router.post('/refresh', AuthController.refresh);
router.post('/logout', requireAuth, AuthController.logout);
router.get('/me', requireAuth, AuthController.getMe);

export default router;
