import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types/index.js';

/**
 * Role-Based Access Control: Enforces ADMIN role
 */
export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      },
    });
    return;
  }

  if (req.user.role !== 'ADMIN') {
    res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Administrative privileges are required to access this resource.',
      },
    });
    return;
  }

  next();
};
