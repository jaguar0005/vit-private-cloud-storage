import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/auth.service.js';
import { TokenService } from '../services/token.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

const requestOtpSchema = z.object({
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
});

const verifyOtpSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  otp: z.string().length(6, 'Verification code must be exactly 6 digits').regex(/^\d{6}$/, 'Code must contain only digits'),
});

export class AuthController {
  /**
   * POST /api/v1/auth/request-otp
   */
  public static async requestOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validation = requestOtpSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0]?.message || 'Invalid email format.',
          },
        });
        return;
      }

      const { email } = validation.data;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      const result = await AuthService.requestOtp(email, clientIp);
      res.status(200).json({
        success: true,
        message: result.message,
        devOtp: result.devOtp,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to request verification code.';
      res.status(400).json({
        success: false,
        error: {
          code: 'OTP_REQUEST_FAILED',
          message,
        },
      });
    }
  }

  /**
   * POST /api/v1/auth/verify-otp
   */
  public static async verifyOtp(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validation = verifyOtpSchema.safeParse(req.body);
      if (!validation.success) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error.errors[0]?.message || 'Invalid code format.',
          },
        });
        return;
      }

      const { email, otp } = validation.data;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
      const userAgent = req.headers['user-agent'] || 'Unknown';

      const authResult = await AuthService.verifyOtp(email, otp, clientIp, userAgent);

      // Set httpOnly, secure, SameSite cookies
      TokenService.setAuthCookies(res, authResult.accessToken, authResult.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user: authResult.user,
        },
        message: 'Successfully authenticated. Welcome to your VIT Private Storage Vault!',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed.';
      res.status(401).json({
        success: false,
        error: {
          code: 'OTP_VERIFICATION_FAILED',
          message,
        },
      });
    }
  }

  /**
   * POST /api/v1/auth/refresh
   */
  public static async refresh(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({
          success: false,
          error: {
            code: 'MISSING_REFRESH_TOKEN',
            message: 'No refresh token provided in session cookies.',
          },
        });
        return;
      }

      const rotated = await AuthService.rotateSession(refreshToken);
      TokenService.setAuthCookies(res, rotated.accessToken, rotated.refreshToken);

      res.status(200).json({
        success: true,
        data: {
          user: rotated.user,
        },
        message: 'Session refreshed successfully.',
      });
    } catch (err: unknown) {
      TokenService.clearAuthCookies(res);
      const message = err instanceof Error ? err.message : 'Session refresh failed.';
      res.status(401).json({
        success: false,
        error: {
          code: 'REFRESH_FAILED',
          message,
        },
      });
    }
  }

  /**
   * POST /api/v1/auth/logout
   */
  public static async logout(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.cookies?.refreshToken;
      await AuthService.logout(refreshToken, req.user?.id);
      TokenService.clearAuthCookies(res);

      res.status(200).json({
        success: true,
        message: 'Logged out successfully. Vault session closed.',
      });
    } catch (err: unknown) {
      TokenService.clearAuthCookies(res);
      next(err);
    }
  }

  /**
   * GET /api/v1/auth/me
   */
  public static async getMe(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Not authenticated.',
          },
        });
        return;
      }

      const profile = await AuthService.getUserProfile(req.user.id);
      if (!profile) {
        TokenService.clearAuthCookies(res);
        res.status(404).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User profile does not exist.',
          },
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          user: profile,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export default AuthController;
