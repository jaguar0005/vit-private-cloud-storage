import rateLimit from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

/**
 * Rate limiter for requesting login OTPs: max 5 requests per 15 minutes per IP (disabled in tests)
 */
export const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many OTP requests from this IP address. Please wait 15 minutes before requesting again.',
    },
  },
});

/**
 * Rate limiter for verifying OTPs to protect against brute-force attacks: max 10 attempts per 15 minutes per IP
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'BRUTE_FORCE_LOCKOUT',
      message: 'Too many verification attempts from this IP address. Please wait 15 minutes before trying again.',
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
