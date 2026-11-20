import prisma from './prisma.js';

/**
 * Initializes database schema with PostgreSQL DDL if tables do not exist.
 * Ensures smooth startup in both Docker Compose and embedded development modes.
 */
export const initSchema = async (): Promise<void> => {
  try {
    // Check if User table exists
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
          CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SharePermission') THEN
          CREATE TYPE "SharePermission" AS ENUM ('VIEW_ONLY', 'DOWNLOAD');
        END IF;
      END$$;
    `);

    // Create User table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT UNIQUE NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'STUDENT',
        "quota_bytes" BIGINT NOT NULL DEFAULT 209715200,
        "used_bytes" BIGINT NOT NULL DEFAULT 0,
        "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create Otp table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Otp" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL,
        "hashed_code" TEXT NOT NULL,
        "expires_at" TIMESTAMP(3) NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "user_id" TEXT,
        CONSTRAINT "Otp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "Otp_email_idx" ON "Otp" ("email");
    `);

    // Create RefreshSession table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RefreshSession" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT NOT NULL,
        "token_hash" TEXT UNIQUE NOT NULL,
        "family_id" TEXT NOT NULL,
        "expires_at" TIMESTAMP(3) NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RefreshSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "RefreshSession_user_id_idx" ON "RefreshSession" ("user_id");
      CREATE INDEX IF NOT EXISTS "RefreshSession_family_id_idx" ON "RefreshSession" ("family_id");
    `);

    // Create Folder table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Folder" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "parent_id" TEXT,
        "user_id" TEXT NOT NULL,
        "deleted_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Folder_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "Folder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "Folder_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "Folder_user_id_idx" ON "Folder" ("user_id");
      CREATE INDEX IF NOT EXISTS "Folder_parent_id_idx" ON "Folder" ("parent_id");
      CREATE INDEX IF NOT EXISTS "Folder_deleted_at_idx" ON "Folder" ("deleted_at");
    `);

    // Create File table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "File" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "storage_uuid" TEXT UNIQUE NOT NULL,
        "mime_type" TEXT NOT NULL,
        "size_bytes" BIGINT NOT NULL,
        "sha256_hash" TEXT NOT NULL,
        "encrypted_dek" TEXT NOT NULL,
        "iv" TEXT NOT NULL,
        "auth_tag" TEXT NOT NULL,
        "folder_id" TEXT,
        "user_id" TEXT NOT NULL,
        "is_starred" BOOLEAN NOT NULL DEFAULT false,
        "deleted_at" TIMESTAMP(3),
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "File_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "Folder" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "File_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "File_user_id_idx" ON "File" ("user_id");
      CREATE INDEX IF NOT EXISTS "File_folder_id_idx" ON "File" ("folder_id");
      CREATE INDEX IF NOT EXISTS "File_deleted_at_idx" ON "File" ("deleted_at");
      CREATE INDEX IF NOT EXISTS "File_sha256_hash_idx" ON "File" ("sha256_hash");
    `);

    // Create FileVersion table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FileVersion" (
        "id" TEXT PRIMARY KEY,
        "file_id" TEXT NOT NULL,
        "version_number" INTEGER NOT NULL,
        "storage_uuid" TEXT UNIQUE NOT NULL,
        "size_bytes" BIGINT NOT NULL,
        "sha256_hash" TEXT NOT NULL,
        "encrypted_dek" TEXT NOT NULL,
        "iv" TEXT NOT NULL,
        "auth_tag" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FileVersion_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "File" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "FileVersion_file_id_idx" ON "FileVersion" ("file_id");
    `);

    // Create ShareLink table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ShareLink" (
        "id" TEXT PRIMARY KEY,
        "file_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "token" TEXT UNIQUE NOT NULL,
        "password_hash" TEXT,
        "expires_at" TIMESTAMP(3),
        "max_downloads" INTEGER,
        "download_count" INTEGER NOT NULL DEFAULT 0,
        "permission" "SharePermission" NOT NULL DEFAULT 'DOWNLOAD',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ShareLink_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "File" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ShareLink_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "ShareLink_token_idx" ON "ShareLink" ("token");
      CREATE INDEX IF NOT EXISTS "ShareLink_file_id_idx" ON "ShareLink" ("file_id");
    `);

    // Create AuditLog table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AuditLog" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT,
        "action" TEXT NOT NULL,
        "resource_id" TEXT,
        "ip_address" TEXT,
        "user_agent" TEXT,
        "details" JSONB,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "AuditLog_user_id_idx" ON "AuditLog" ("user_id");
      CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog" ("action");
      CREATE INDEX IF NOT EXISTS "AuditLog_created_at_idx" ON "AuditLog" ("created_at");
    `);

    // Create QuarantineLog table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "QuarantineLog" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT,
        "original_name" TEXT NOT NULL,
        "size_bytes" BIGINT NOT NULL,
        "violation_reason" TEXT NOT NULL,
        "ip_address" TEXT,
        "resolved" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "QuarantineLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
      CREATE INDEX IF NOT EXISTS "QuarantineLog_user_id_idx" ON "QuarantineLog" ("user_id");
    `);

    console.log('✅ PostgreSQL schema verified and ready.');
  } catch (err) {
    console.warn('Note: Schema verification step encountered an issue or tables already present:', err);
  }
};
