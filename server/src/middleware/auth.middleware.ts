import { Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service.js';
import { AuthService } from '../services/auth.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export type { AuthenticatedRequest };

/**
 * Authentication middleware that verifies access token from cookies or Bearer header.
 * Performs transparent session renewal if the access token expired but the refresh token is valid.
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let accessToken = req.cookies?.accessToken;

    // Check Bearer header as fallback (e.g. for API clients)
    if (!accessToken && req.headers.authorization?.startsWith('Bearer ')) {
      accessToken = req.headers.authorization.split(' ')[1];
    }

    if (accessToken) {
      const payload = TokenService.verifyAccessToken(accessToken);
      if (payload) {
        req.user = {
          id: payload.id,
          email: payload.email,
          role: payload.role,
        };
        return next();
      }
    }

    // Access token missing or expired; try transparent rotation using refresh token cookie
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      try {
        const rotated = await AuthService.rotateSession(refreshToken);
        TokenService.setAuthCookies(res, rotated.accessToken, rotated.refreshToken);
        req.user = rotated.user;
        return next();
      } catch {
        // Refresh token invalid or expired
        TokenService.clearAuthCookies(res);
      }
    }

    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required. Please sign in with your @vit.edu email.',
      },
    });
  } catch (err) {
    next(err);
  }
};
