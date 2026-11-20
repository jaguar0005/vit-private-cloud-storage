import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';

// Load environment configuration from .env in project root or current working directory
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Detect project root directory unambiguously
const isRoot = fs.existsSync(path.resolve(process.cwd(), 'package.json')) && fs.existsSync(path.resolve(process.cwd(), 'server'));
const projectRootDir = isRoot ? process.cwd() : path.resolve(process.cwd(), '..');
const defaultStorageRootDir = path.resolve(projectRootDir, 'storage');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),

  // Database URL
  DATABASE_URL: z.string().default('postgresql://postgres:postgrespassword@localhost:5432/cloud_storage?schema=public'),

  // Cryptographic Master Key for Envelope Encryption (64 hex characters = 32 bytes)
  STORAGE_MASTER_KEY: z.string().min(64, 'STORAGE_MASTER_KEY must be a 64-character hex string (32 bytes)').default(
    '4a8f9c1d2e3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f'
  ),

  // JWT configuration
  JWT_ACCESS_SECRET: z.string().min(16).default('vit_cloud_access_secret_super_secure_random_key_12345'),
  JWT_REFRESH_SECRET: z.string().min(16).default('vit_cloud_refresh_secret_super_secure_random_key_67890'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Storage paths on host laptop
  STORAGE_ROOT_DIR: z.string().default(defaultStorageRootDir),
  STORAGE_VAULT_DIR: z.string().default(path.resolve(defaultStorageRootDir, 'vault')),
  STORAGE_QUARANTINE_DIR: z.string().default(path.resolve(defaultStorageRootDir, 'quarantine')),
  STORAGE_CHUNKS_DIR: z.string().default(path.resolve(defaultStorageRootDir, 'chunks')),

  // Storage Pool Limits
  DEFAULT_USER_QUOTA_BYTES: z.coerce.number().default(209715200), // 200 MB
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(209715200),      // 200 MB
  DISK_GUARD_THRESHOLD_MB: z.coerce.number().default(1024),       // 1 GB free space alert threshold
  STORAGE_POOL_MAX_BYTES: z.coerce.number().default(21474836480), // 20 GB laptop storage pool

  // Authentication & Security Guardrails
  ALLOWED_EMAIL_DOMAIN: z.string().default('vit.edu'),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(3),
  DEV_OTP_CONSOLE: z.coerce.boolean().default(true),

  // Safe Archive Central Directory Guardrails
  ARCHIVE_MAX_UNCOMPRESSED_BYTES: z.coerce.number().default(524288000), // 500 MB
  ARCHIVE_MAX_RATIO: z.coerce.number().default(100),                    // 100:1 ratio
  ARCHIVE_MAX_ENTRIES: z.coerce.number().default(1000),                 // 1000 items
  ARCHIVE_MAX_DEPTH: z.coerce.number().default(3),                      // 3 directory levels

  // ClamAV Scanner configuration
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().default(10000),
  USE_FALLBACK_SCANNER: z.coerce.boolean().default(true),

  // Mailer configuration (Nodemailer)
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().default('VIT Cloud Storage <no-reply@vit.edu>')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuration validation error in environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = {
  ...parsed.data,
  // Forbidden executable & script extensions blocked by upload pipeline Stage 4
  BLOCKED_EXTENSIONS: [
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi',
    '.js', '.vbs', '.jar', '.scr', '.dll', '.com',
    '.hta', '.pif', '.reg', '.iso', '.vhd', '.bin'
  ] as const,
  // Standard EICAR signature for antivirus test suite verification
  EICAR_SIGNATURE: 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'
};

export type AppConfig = typeof config;
export default config;
