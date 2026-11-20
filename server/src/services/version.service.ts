import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import prisma from '../db/prisma.js';
import config from '../config/index.js';
import CryptoService from './crypto.service.js';

export class VersionService {
  /**
   * Lists all historical versions for a specific file
   */
  public static async getVersions(userId: string, fileId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, user_id: userId, deleted_at: null },
      include: {
        versions: {
          orderBy: { version_number: 'desc' },
        },
      },
    });

    if (!file) {
      const err = new Error('File not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    return {
      activeFile: {
        id: file.id,
        name: file.name,
        size_bytes: file.size_bytes.toString(),
        mime_type: file.mime_type,
        updated_at: file.updated_at,
        sha256_hash: file.sha256_hash,
      },
      versions: file.versions.map((v) => ({
        id: v.id,
        version_number: v.version_number,
        size_bytes: v.size_bytes.toString(),
        sha256_hash: v.sha256_hash,
        created_at: v.created_at,
      })),
    };
  }

  /**
   * Reverts active file to a historical version
   */
  public static async revertVersion(userId: string, fileId: string, versionId: string, clientIp = '127.0.0.1') {
    const file = await prisma.file.findFirst({
      where: { id: fileId, user_id: userId, deleted_at: null },
      include: {
        versions: {
          orderBy: { version_number: 'asc' },
        },
      },
    });

    if (!file) {
      const err = new Error('File not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const targetVersion = file.versions.find((v) => v.id === versionId);
    if (!targetVersion) {
      const err = new Error('Target version not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const targetVaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${targetVersion.storage_uuid}.enc`);
    if (!fs.existsSync(targetVaultPath)) {
      const err = new Error('Version encrypted storage object missing.');
      (err as any).statusCode = 404;
      throw err;
    }

    // Clone encrypted ciphertext to a new unique UUID for the new active file
    const newActiveStorageUuid = crypto.randomUUID();
    const newActiveVaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${newActiveStorageUuid}.enc`);
    fs.copyFileSync(targetVaultPath, newActiveVaultPath);

    // Compute version numbers: current active file will be archived as next version
    const maxVersionNumber = file.versions.reduce((max, v) => Math.max(max, v.version_number), 0);
    const archiveVersionNumber = maxVersionNumber + 1;

    try {
      const result = await prisma.$transaction(async (tx) => {
        // 1. Lock user row to verify atomic quota
        const userRows = await tx.$queryRaw<Array<{ id: string; used_bytes: bigint; quota_bytes: bigint }>>`
          SELECT id, used_bytes, quota_bytes FROM "User" WHERE id = ${userId} FOR UPDATE
        `;

        if (!userRows || userRows.length === 0) {
          throw new Error('User not found.');
        }

        const user = userRows[0];
        let netDelta = targetVersion.size_bytes; // Adding newly cloned active file

        // 2. Archive current active file as a historical version
        await tx.fileVersion.create({
          data: {
            file_id: file.id,
            version_number: archiveVersionNumber,
            storage_uuid: file.storage_uuid,
            size_bytes: file.size_bytes,
            sha256_hash: file.sha256_hash,
            encrypted_dek: file.encrypted_dek,
            iv: file.iv,
            auth_tag: file.auth_tag,
          },
        });

        // 3. Prune oldest version if version count exceeds 5
        const existingVersions = await tx.fileVersion.findMany({
          where: { file_id: file.id },
          orderBy: { version_number: 'asc' },
        });

        let prunedVersionId: string | null = null;
        if (existingVersions.length > 5) {
          const oldest = existingVersions[0];
          prunedVersionId = oldest.id;
          netDelta -= oldest.size_bytes;

          const oldestPath = path.resolve(config.STORAGE_VAULT_DIR, `${oldest.storage_uuid}.enc`);
          if (fs.existsSync(oldestPath)) {
            fs.unlinkSync(oldestPath);
          }
          await tx.fileVersion.delete({ where: { id: oldest.id } });
        }

        // 4. Verify user quota doesn't exceed cap
        const newUsed = user.used_bytes + netDelta;
        if (newUsed > user.quota_bytes) {
          throw new Error(`Insufficient storage quota to revert. Required: ${netDelta} bytes.`);
        }

        // 5. Update user used bytes
        await tx.$executeRaw`
          UPDATE "User" SET used_bytes = ${newUsed} WHERE id = ${userId}
        `;

        // 6. Update active file record with reverted contents
        const updatedFile = await tx.file.update({
          where: { id: file.id },
          data: {
            storage_uuid: newActiveStorageUuid,
            size_bytes: targetVersion.size_bytes,
            sha256_hash: targetVersion.sha256_hash,
            encrypted_dek: targetVersion.encrypted_dek,
            iv: targetVersion.iv,
            auth_tag: targetVersion.auth_tag,
          },
        });

        // 7. Audit log
        await tx.auditLog.create({
          data: {
            user_id: userId,
            action: 'FILE_VERSION_REVERT',
            resource_id: file.id,
            ip_address: clientIp,
            details: {
              revertedToVersion: targetVersion.version_number,
              archivedVersion: archiveVersionNumber,
              prunedVersionId,
            },
          },
        });

        return updatedFile;
      });

      return result;
    } catch (err) {
      // Clean up cloned file if transaction failed
      if (fs.existsSync(newActiveVaultPath)) {
        fs.unlinkSync(newActiveVaultPath);
      }
      throw err;
    }
  }

  /**
   * Streams decrypted historical version
   */
  public static async streamVersion(userId: string, fileId: string, versionId: string) {
    const file = await prisma.file.findFirst({
      where: { id: fileId, user_id: userId, deleted_at: null },
    });

    if (!file) {
      const err = new Error('File not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const version = await prisma.fileVersion.findFirst({
      where: { id: versionId, file_id: fileId },
    });

    if (!version) {
      const err = new Error('Version not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const vaultFilePath = path.resolve(config.STORAGE_VAULT_DIR, `${version.storage_uuid}.enc`);
    if (!fs.existsSync(vaultFilePath)) {
      const err = new Error('Encrypted object missing from storage vault.');
      (err as any).statusCode = 404;
      throw err;
    }

    const stream = CryptoService.createDecryptedStream(
      vaultFilePath,
      version.encrypted_dek,
      version.iv,
      version.auth_tag
    );

    return {
      stream,
      fileName: `v${version.version_number}_${file.name}`,
      mimeType: file.mime_type,
      sizeBytes: version.size_bytes.toString(),
    };
  }
}

export default VersionService;
