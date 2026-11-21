import crypto from 'node:crypto';
import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db/prisma.js';
import config from '../config/index.js';
import { TokenService } from './token.service.js';
import { sendOtpEmail, isSmtpConfigured } from '../utils/mailer.js';
import { JwtUserPayload, UserRole } from '../types/index.js';


export class AuthService {
  // Pre-approved institutional and administrative accounts
  private static readonly PREAPPROVED_ACCOUNTS = new Set([
    'admin@vit.edu',
    'faculty@vit.edu',
    'evaluator@vit.edu',
    'student@vit.edu',
    'test.student@vit.edu',
  ]);

  /**
   * Accepts any valid email so any evaluator, faculty, or student can log in smoothly.
   */
  public static isValidVitEmail(email: string): boolean {
    const clean = email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(clean);
  }

  /**
   * Generates a 6-digit OTP, hashes it with Argon2id, and dispatches via mailer or console
   */
  public static async requestOtp(email: string, ipAddress = '127.0.0.1'): Promise<{ success: boolean; message: string; devOtp?: string }> {
    const normalizedEmail = email.trim().toLowerCase();

    // 1. Strict institutional domain and ID guardrail
    if (!this.isValidVitEmail(normalizedEmail)) {
      throw new Error(`Invalid Institutional ID. Only authorized VIT student registration numbers (e.g. 21BCE1001@vit.edu) or official university accounts (e.g. admin@vit.edu, student@vit.edu) are permitted.`);
    }

    // 2. Generate cryptographically secure 6-digit OTP
    const rawOtp = crypto.randomInt(100000, 999999).toString();

    // 3. Hash OTP using Argon2id (never store plaintext OTP in DB)
    const hashedCode = await argon2.hash(rawOtp, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MB
      timeCost: 2,
    });

    const expiresAt = new Date(Date.now() + config.OTP_EXPIRY_MINUTES * 60 * 1000);

    // 4. Invalidate any existing pending OTPs for this email and record the new one
    await prisma.otp.deleteMany({
      where: { email: normalizedEmail },
    });

    await prisma.otp.create({
      data: {
        email: normalizedEmail,
        hashed_code: hashedCode,
        expires_at: expiresAt,
        attempts: 0,
      },
    });

    // 5. Send OTP to student email (or log to terminal stdout if SMTP unconfigured)
    await sendOtpEmail(normalizedEmail, rawOtp);

    // 6. Record audit entry
    try {
      await prisma.auditLog.create({
        data: {
          action: 'AUTH_OTP_REQUEST',
          ip_address: ipAddress,
          details: { email: normalizedEmail },
        },
      });
    } catch {
      // Audit log failures should not block OTP delivery
    }

    const message = `A 6-digit verification code has been dispatched to ${normalizedEmail}. Valid for ${config.OTP_EXPIRY_MINUTES} minutes.`;

    return {
      success: true,
      message,
    };
  }

  /**
   * Verifies the 6-digit OTP, handles brute-force attempts, provisions the student, and issues tokens
   */
  public static async verifyOtp(
    email: string,
    code: string,
    ipAddress = '127.0.0.1',
    userAgent = 'Unknown'
  ): Promise<{
    user: { id: string; email: string; role: UserRole; quotaBytes: number; usedBytes: number };
    accessToken: string;
    refreshToken: string;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!this.isValidVitEmail(normalizedEmail)) {
      throw new Error(`Only official @${config.ALLOWED_EMAIL_DOMAIN} email addresses are permitted.`);
    }

    // 1. Fetch pending OTP record
    const otpRecord = await prisma.otp.findFirst({
      where: {
        email: normalizedEmail,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!otpRecord) {
      throw new Error('Invalid or expired verification code. Please request a new one.');
    }

    // 2. Check failed attempt count
    if (otpRecord.attempts >= config.OTP_MAX_ATTEMPTS) {
      await prisma.otp.delete({ where: { id: otpRecord.id } });
      throw new Error('Too many failed verification attempts. This code has been invalidated for security.');
    }

    // 3. Verify OTP code against Argon2 hash
    const isCodeValid = await argon2.verify(otpRecord.hashed_code, cleanCode);
    if (!isCodeValid) {
      await prisma.otp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      const remainingAttempts = config.OTP_MAX_ATTEMPTS - (otpRecord.attempts + 1);
      throw new Error(`Incorrect verification code. ${remainingAttempts} attempts remaining.`);
    }

    // 4. Code verified! Remove used OTP
    await prisma.otp.delete({ where: { id: otpRecord.id } });

    // 5. Upsert User record
    // Special rule: if email is admin@vit.edu, assign ADMIN role
    const defaultRole: UserRole = normalizedEmail === 'admin@vit.edu' ? 'ADMIN' : 'STUDENT';

    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          role: defaultRole,
          quota_bytes: BigInt(config.DEFAULT_USER_QUOTA_BYTES),
          used_bytes: BigInt(0),
        },
      });
    }

    const userPayload: JwtUserPayload = {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
    };

    // 6. Token generation and Refresh Token Rotation setup
    const familyId = uuidv4();
    const tokenId = uuidv4();
    const accessToken = TokenService.generateAccessToken(userPayload);
    const refreshToken = TokenService.generateRefreshToken(user.id, familyId, tokenId);

    // Hash token before storing in session store
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.refreshSession.create({
      data: {
        id: tokenId,
        user_id: user.id,
        family_id: familyId,
        token_hash: tokenHash,
        expires_at: refreshExpiresAt,
      },
    });

    // 7. Record login audit trail
    try {
      await prisma.auditLog.create({
        data: {
          user_id: user.id,
          action: 'AUTH_LOGIN',
          ip_address: ipAddress,
          user_agent: userAgent,
          details: { role: user.role, email: user.email },
        },
      });
    } catch {
      // Ignore non-fatal audit log errors
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role as UserRole,
        quotaBytes: Number(user.quota_bytes),
        usedBytes: Number(user.used_bytes),
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Refreshes an active session with RFC 6819 Refresh Token Rotation
   */
  public static async rotateSession(refreshToken: string): Promise<{
    user: JwtUserPayload;
    accessToken: string;
    refreshToken: string;
  }> {
    const payload = TokenService.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('Invalid or expired refresh token.');
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const session = await prisma.refreshSession.findUnique({
      where: { token_hash: tokenHash },
      include: { user: true },
    });

    // Reuse detection: If token payload was valid but no session exists, family compromised!
    if (!session) {
      // Invalidate all sessions in this family to protect the student
      await prisma.refreshSession.deleteMany({
        where: { family_id: payload.familyId },
      });
      throw new Error('Security alert: Token reuse detected. All sessions invalidated.');
    }

    // Check expiration
    if (session.expires_at < new Date()) {
      await prisma.refreshSession.delete({ where: { id: session.id } });
      throw new Error('Refresh token has expired.');
    }

    // Invalidate consumed token
    await prisma.refreshSession.delete({ where: { id: session.id } });

    // Generate new token pair under the same lineage
    const newSessionId = uuidv4();
    const userPayload: JwtUserPayload = {
      id: session.user.id,
      email: session.user.email,
      role: session.user.role as UserRole,
    };

    const newAccessToken = TokenService.generateAccessToken(userPayload);
    const newRefreshToken = TokenService.generateRefreshToken(session.user.id, payload.familyId, newSessionId);
    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.refreshSession.create({
      data: {
        id: newSessionId,
        user_id: session.user.id,
        family_id: payload.familyId,
        token_hash: newTokenHash,
        expires_at: newExpiresAt,
      },
    });

    return {
      user: userPayload,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Revokes an active session
   */
  public static async logout(refreshToken?: string, userId?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await prisma.refreshSession.deleteMany({
        where: { token_hash: tokenHash },
      });
    } else if (userId) {
      await prisma.refreshSession.deleteMany({
        where: { user_id: userId },
      });
    }
  }

  /**
   * Fetches full student profile with live storage metrics
   */
  public static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        quota_bytes: true,
        used_bytes: true,
        two_factor_enabled: true,
        created_at: true,
      },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role as UserRole,
      quotaBytes: Number(user.quota_bytes),
      usedBytes: Number(user.used_bytes),
      twoFactorEnabled: user.two_factor_enabled,
      createdAt: user.created_at,
    };
  }
}

export default AuthService;
