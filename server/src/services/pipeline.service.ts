import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { fileTypeFromFile } from 'file-type';
import prisma from '../db/prisma.js';
import config from '../config/index.js';
import { QuotaService } from './quota.service.js';
import { CryptoService } from './crypto.service.js';
import { ArchiveService } from './archive.service.js';
import { ScannerService } from './scanner.service.js';

export interface PipelineUploadInput {
  userId: string;
  originalFilename: string;
  mimeType: string;
  quarantineFilePath: string;
  fileSizeBytes: number;
  folderId?: string | null;
  clientIp?: string;
}

export interface PipelineSuccessOutput {
  fileId: string;
  name: string;
  storageUuid: string;
  sizeBytes: number;
  mimeType: string;
  sha256Hash: string;
  folderId: string | null;
}

export class PipelineViolationError extends Error {
  public stage: number;
  public reason: string;

  constructor(stage: number, reason: string) {
    super(`Stage ${stage} Security Violation: ${reason}`);
    this.name = 'PipelineViolationError';
    this.stage = stage;
    this.reason = reason;
  }
}

export class UploadPipelineService {
  /**
   * Executes the strict 9-stage verification pipeline before admitting any file into permanent vault storage.
   */
  public static async executePipeline(input: PipelineUploadInput): Promise<PipelineSuccessOutput> {
    const {
      userId,
      originalFilename,
      quarantineFilePath,
      fileSizeBytes,
      folderId,
      clientIp = '127.0.0.1',
    } = input;

    let reservedBytes = 0;

    try {
      // ----------------------------------------------------------------------
      // STAGE 1: Streaming Size Bound Enforcement
      // ----------------------------------------------------------------------
      if (fileSizeBytes > config.MAX_FILE_SIZE_BYTES) {
        throw new PipelineViolationError(
          1,
          `File size (${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB) exceeds maximum limit of ${config.MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
        );
      }

      // ----------------------------------------------------------------------
      // STAGE 2: Atomic Quota Reservation with Row Lock
      // ----------------------------------------------------------------------
      await QuotaService.reserveQuota(userId, fileSizeBytes);
      reservedBytes = fileSizeBytes;

      // ----------------------------------------------------------------------
      // STAGE 3: Quarantine Directory Verification
      // ----------------------------------------------------------------------
      if (!fs.existsSync(quarantineFilePath)) {
        throw new PipelineViolationError(3, 'Quarantine staging payload missing from disk.');
      }

      // ----------------------------------------------------------------------
      // STAGE 4: Extension Denylist Check
      // ----------------------------------------------------------------------
      const ext = path.extname(originalFilename).toLowerCase();
      if ((config.BLOCKED_EXTENSIONS as readonly string[]).includes(ext)) {
        throw new PipelineViolationError(
          4,
          `Forbidden executable or script extension ("${ext}"). Uploads of executables and scripts are strictly prohibited.`
        );
      }

      // ----------------------------------------------------------------------
      // STAGE 5: Magic Bytes Verification
      // ----------------------------------------------------------------------
      // Read initial bytes to verify true file format
      const buffer = Buffer.alloc(512);
      const fd = await fs.promises.open(quarantineFilePath, 'r');
      await fd.read(buffer, 0, 512, 0);
      await fd.close();

      // Check for disguised DOS / PE Executable ('MZ') or Linux ELF header
      if (
        (buffer[0] === 0x4d && buffer[1] === 0x5a) || // 'MZ'
        (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) // '\x7fELF'
      ) {
        throw new PipelineViolationError(
          5,
          'Magic bytes mismatch: File headers indicate an executable binary payload disguised under a non-executable extension.'
        );
      }

      // Inspect using file-type library
      const detectedType = await fileTypeFromFile(quarantineFilePath);
      if (detectedType) {
        const detectedExt = `.${detectedType.ext}`.toLowerCase();
        // If detected extension is in blocked list
        if ((config.BLOCKED_EXTENSIONS as readonly string[]).includes(detectedExt)) {
          throw new PipelineViolationError(
            5,
            `Magic bytes mismatch: Binary content represents forbidden executable type "${detectedType.ext}".`
          );
        }
      }

      // ----------------------------------------------------------------------
      // STAGE 6: Safe Archive Inspection without Extraction
      // ----------------------------------------------------------------------
      const isZip = ext === '.zip' || detectedType?.ext === 'zip';
      if (isZip) {
        const archiveInspection = await ArchiveService.inspectZip(quarantineFilePath);
        if (!archiveInspection.isSafe) {
          throw new PipelineViolationError(
            6,
            archiveInspection.violationReason || 'Archive failed security validation.'
          );
        }
      }

      // ----------------------------------------------------------------------
      // STAGE 7: Antivirus Scanning (ClamAV / Fallback EICAR Engine)
      // ----------------------------------------------------------------------
      const scanResult = await ScannerService.scanFile(quarantineFilePath);
      if (scanResult.isInfected) {
        throw new PipelineViolationError(
          7,
          `Malware signature detected: "${scanResult.virusName}" (${scanResult.scannerUsed}). Payload blocked.`
        );
      }

      // ----------------------------------------------------------------------
      // STAGE 8: Envelope Encryption & Permanent Commitment
      // ----------------------------------------------------------------------
      const storageUuid = uuidv4();
      const envelopeMeta = await CryptoService.encryptAndStore(quarantineFilePath, storageUuid);

      // Verify and handle versioning (last 5 versions) if file with same name exists
      const existingFile = await prisma.file.findFirst({
        where: {
          user_id: userId,
          folder_id: folderId || null,
          name: originalFilename,
          deleted_at: null,
        },
        include: { versions: { orderBy: { version_number: 'desc' } } },
      });

      let committedFile;

      if (existingFile) {
        // Move current active file to versions
        const nextVersionNumber = existingFile.versions.length > 0 ? existingFile.versions[0].version_number + 1 : 1;

        await prisma.$transaction(async (tx) => {
          // Record current active file as a historical version
          await tx.fileVersion.create({
            data: {
              file_id: existingFile.id,
              version_number: nextVersionNumber,
              storage_uuid: existingFile.storage_uuid,
              size_bytes: existingFile.size_bytes,
              sha256_hash: existingFile.sha256_hash,
              encrypted_dek: existingFile.encrypted_dek,
              iv: existingFile.iv,
              auth_tag: existingFile.auth_tag,
            },
          });

          // If version count exceeds 5, prune the oldest version
          const allVersions = await tx.fileVersion.findMany({
            where: { file_id: existingFile.id },
            orderBy: { version_number: 'asc' },
          });

          if (allVersions.length >= 5) {
            const oldest = allVersions[0];
            const oldestVaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${oldest.storage_uuid}.enc`);
            if (fs.existsSync(oldestVaultPath)) {
              fs.unlinkSync(oldestVaultPath);
            }
            await tx.fileVersion.delete({ where: { id: oldest.id } });
            // Refund pruned version quota
            await tx.$executeRaw`
              UPDATE "User" SET used_bytes = GREATEST(0, used_bytes - ${oldest.size_bytes}) WHERE id = ${userId}
            `;
          }

          // Update active file with new encrypted payload
          committedFile = await tx.file.update({
            where: { id: existingFile.id },
            data: {
              storage_uuid: storageUuid,
              size_bytes: BigInt(envelopeMeta.sizeBytes),
              sha256_hash: envelopeMeta.sha256Hash,
              encrypted_dek: envelopeMeta.encryptedDek,
              iv: envelopeMeta.iv,
              auth_tag: envelopeMeta.authTag,
              mime_type: detectedType?.mime || input.mimeType,
            },
          });

          // Log file version update
          await tx.auditLog.create({
            data: {
              user_id: userId,
              action: 'FILE_VERSION_UPLOAD',
              resource_id: committedFile.id,
              ip_address: clientIp,
              details: { name: originalFilename, version: nextVersionNumber },
            },
          });
        });
      } else {
        // Brand new file insertion
        committedFile = await prisma.$transaction(async (tx) => {
          const file = await tx.file.create({
            data: {
              name: originalFilename,
              storage_uuid: storageUuid,
              mime_type: detectedType?.mime || input.mimeType,
              size_bytes: BigInt(envelopeMeta.sizeBytes),
              sha256_hash: envelopeMeta.sha256Hash,
              encrypted_dek: envelopeMeta.encryptedDek,
              iv: envelopeMeta.iv,
              auth_tag: envelopeMeta.authTag,
              folder_id: folderId || null,
              user_id: userId,
            },
          });

          await tx.auditLog.create({
            data: {
              user_id: userId,
              action: 'FILE_UPLOAD',
              resource_id: file.id,
              ip_address: clientIp,
              details: { name: originalFilename, size: envelopeMeta.sizeBytes },
            },
          });

          return file;
        });
      }

      // Safe clean up of quarantine staging file
      if (fs.existsSync(quarantineFilePath)) {
        try {
          await fs.promises.unlink(quarantineFilePath);
        } catch {
          await new Promise((r) => setTimeout(r, 60));
          if (fs.existsSync(quarantineFilePath)) {
            try {
              await fs.promises.unlink(quarantineFilePath);
            } catch {
              // Ignore if OS still holding handle temporarily
            }
          }
        }
      }

      return {
        fileId: committedFile!.id,
        name: committedFile!.name,
        storageUuid: committedFile!.storage_uuid,
        sizeBytes: Number(committedFile!.size_bytes),
        mimeType: committedFile!.mime_type,
        sha256Hash: committedFile!.sha256_hash,
        folderId: committedFile!.folder_id,
      };
    } catch (err: unknown) {
      // ----------------------------------------------------------------------
      // STAGE 9: Rollback on Failure & Quarantine Incident Logging
      // ----------------------------------------------------------------------
      // 1. Delete temporary quarantine file
      if (fs.existsSync(quarantineFilePath)) {
        try {
          fs.unlinkSync(quarantineFilePath);
        } catch {
          // Ignore unlink errors
        }
      }

      // 2. Refund reserved quota
      if (reservedBytes > 0) {
        await QuotaService.releaseQuota(userId, reservedBytes);
      }

      // 3. Record security incident in QuarantineLog
      const violationReason = err instanceof Error ? err.message : 'Unknown security failure';
      try {
        await prisma.quarantineLog.create({
          data: {
            user_id: userId,
            original_name: originalFilename,
            size_bytes: BigInt(fileSizeBytes),
            violation_reason: violationReason,
            ip_address: clientIp,
            resolved: false,
          },
        });
      } catch {
        // Audit log persistence error should not swallow original security error
      }

      throw err;
    }
  }
}

export default UploadPipelineService;
