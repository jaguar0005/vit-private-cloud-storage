import rateLimit from 'express-rate-limit';

const isDev = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Rate limiter for requesting login OTPs:
 * In development or localhost, relaxed so testing & live demonstrations are seamless.
 */
export const otpRequestLimiter = rateLimit({
  windowMs: isDev ? 60 * 1000 : 15 * 60 * 1000,
  max: isDev ? 100 : 10,
  skip: (req) => {
    if (isDev) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip.includes('127.0.0.1') || ip.includes('::1');
    }
    return false;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many OTP requests from this IP address. Please wait a moment before requesting again.',
    },
  },
});

/**
 * Rate limiter for verifying OTPs to protect against brute-force attacks
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: isDev ? 60 * 1000 : 15 * 60 * 1000,
  max: isDev ? 100 : 15,
  skip: (req) => {
    if (isDev) {
      const ip = req.ip || req.socket.remoteAddress || '';
      return ip.includes('127.0.0.1') || ip.includes('::1');
    }
    return false;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'BRUTE_FORCE_LOCKOUT',
      message: 'Too many verification attempts from this IP address. Please wait a moment before trying again.',
    },
  },
});

/**
 * General API request limiter: 500 requests per 15 minutes
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
});
