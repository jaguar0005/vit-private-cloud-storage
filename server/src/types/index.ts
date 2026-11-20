import { Request } from 'express';

export type UserRole = 'STUDENT' | 'ADMIN';

export interface JwtUserPayload {
  id: string;
  email: string;
  role: UserRole;
}

export interface AccessTokenPayload extends JwtUserPayload {
  type: 'access';
}

export interface RefreshTokenPayload {
  userId: string;
  familyId: string;
  tokenId: string;
  type: 'refresh';
}

export interface AuthenticatedRequest extends Request {
  user?: JwtUserPayload;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}
