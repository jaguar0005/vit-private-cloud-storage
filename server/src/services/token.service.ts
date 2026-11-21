import jwt from 'jsonwebtoken';
import { Response } from 'express';
import config from '../config/index.js';
import { AccessTokenPayload, RefreshTokenPayload, JwtUserPayload } from '../types/index.js';


export class TokenService {
  /**
   * Generates a signed Access Token (short-lived, 15m)
   */
  public static generateAccessToken(user: JwtUserPayload): string {
    const payload: AccessTokenPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Generates a signed Refresh Token (long-lived, 7d)
   */
  public static generateRefreshToken(userId: string, familyId: string, tokenId: string): string {
    const payload: RefreshTokenPayload = {
      userId,
      familyId,
      tokenId,
      type: 'refresh',
    };

    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verifies and decodes an Access Token
   */
  public static verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenPayload;
      if (decoded.type !== 'access') return null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Verifies and decodes a Refresh Token
   */
  public static verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as RefreshTokenPayload;
      if (decoded.type !== 'refresh') return null;
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Sets strict httpOnly, secure, SameSite cookies on Express response
   */
  public static setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    const isProduction = config.NODE_ENV === 'production';

    // Access Token Cookie (15 minutes)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    // Refresh Token Cookie (7 days) scoped strictly to auth endpoints
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: `${config.API_PREFIX}/auth`,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  /**
   * Clears auth cookies upon logout
   */
  public static clearAuthCookies(res: Response): void {
    const isProduction = config.NODE_ENV === 'production';

    res.clearCookie('accessToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
    });

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: `${config.API_PREFIX}/auth`,
    });
  }
}

export default TokenService;
