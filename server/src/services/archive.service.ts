import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import config from '../config/index.js';

export interface ArchiveInspectionResult {
  isSafe: boolean;
  entryCount: number;
  totalUncompressedSize: number;
  compressedSize: number;
  compressionRatio: number;
  violationReason?: string;
}

export class ArchiveService {
  /**
   * Safely inspects a ZIP archive's Central Directory headers WITHOUT decompressing payloads.
   * Protects against Zip Bombs, Zip Slip (path traversal), password masking, and excessive nesting.
   */
  public static async inspectZip(archivePath: string): Promise<ArchiveInspectionResult> {
    const stats = await fs.promises.stat(archivePath);
    const compressedSize = Math.max(1, stats.size);

    return new Promise((resolve) => {
      yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
        if (err || !zipfile) {
          return resolve({
            isSafe: false,
            entryCount: 0,
            totalUncompressedSize: 0,
            compressedSize,
            compressionRatio: 0,
            violationReason: `Malformed or unreadable archive: ${err?.message || 'Corrupted ZIP file'}`,
          });
        }

        let entryCount = 0;
        let totalUncompressedSize = 0;

        zipfile.readEntry();

        zipfile.on('entry', (entry: yauzl.Entry) => {
          entryCount++;

          // 1. Zip Slip / Path Traversal Check
          const entryName = entry.fileName;
          if (
            entryName.includes('..') ||
            entryName.startsWith('/') ||
            entryName.startsWith('\\') ||
            /^[a-zA-Z]:/i.test(entryName)
          ) {
            zipfile.close();
            return resolve({
              isSafe: false,
              entryCount,
              totalUncompressedSize,
              compressedSize,
              compressionRatio: 0,
              violationReason: `Security Alert: Path traversal entry ("${entryName}") detected. Potential Zip-Slip attack.`,
            });
          }

          // 2. Password Protection Check (General purpose bit flag 0x01)
          if ((entry.generalPurposeBitFlag & 0x01) !== 0) {
            zipfile.close();
            return resolve({
              isSafe: false,
              entryCount,
              totalUncompressedSize,
              compressedSize,
              compressionRatio: 0,
              violationReason: 'Security Policy: Password-protected archives cannot be safely inspected and are blocked.',
            });
          }

          // 3. Entry Count Limit Check
          if (entryCount > config.ARCHIVE_MAX_ENTRIES) {
            zipfile.close();
            return resolve({
              isSafe: false,
              entryCount,
              totalUncompressedSize,
              compressedSize,
              compressionRatio: 0,
              violationReason: `Security Alert: Archive exceeds maximum allowed entry count of ${config.ARCHIVE_MAX_ENTRIES} items.`,
            });
          }

          // 4. Nesting Depth Check
          const depth = entryName.split(/[/\\]/).filter(Boolean).length;
          if (depth > config.ARCHIVE_MAX_DEPTH + 1) {
            zipfile.close();
            return resolve({
              isSafe: false,
              entryCount,
              totalUncompressedSize,
              compressedSize,
              compressionRatio: 0,
              violationReason: `Security Alert: Archive directory nesting depth (${depth}) exceeds limit of ${config.ARCHIVE_MAX_DEPTH} levels.`,
            });
          }

          totalUncompressedSize += entry.uncompressedSize;

          // 5. Total Uncompressed Size Check
          if (totalUncompressedSize > config.ARCHIVE_MAX_UNCOMPRESSED_BYTES) {
            zipfile.close();
            return resolve({
              isSafe: false,
              entryCount,
              totalUncompressedSize,
              compressedSize,
              compressionRatio: totalUncompressedSize / compressedSize,
              violationReason: `Security Alert: Total uncompressed archive payload exceeds limit of ${config.ARCHIVE_MAX_UNCOMPRESSED_BYTES / (1024 * 1024)} MB.`,
            });
          }

          zipfile.readEntry();
        });

        zipfile.on('end', () => {
          const compressionRatio = totalUncompressedSize / compressedSize;

          // 6. Compression Ratio Check (Zip Bomb Detection)
          if (compressionRatio > config.ARCHIVE_MAX_RATIO) {
            return resolve({
              isSafe: false,
              entryCount,
              totalUncompressedSize,
              compressedSize,
              compressionRatio,
              violationReason: `Security Alert: Abnormal compression ratio of ${compressionRatio.toFixed(1)}:1 (exceeds ${config.ARCHIVE_MAX_RATIO}:1 threshold). Potential Zip Bomb.`,
            });
          }

          return resolve({
            isSafe: true,
            entryCount,
            totalUncompressedSize,
            compressedSize,
            compressionRatio,
          });
        });

        zipfile.on('error', (readErr) => {
          return resolve({
            isSafe: false,
            entryCount,
            totalUncompressedSize,
            compressedSize,
            compressionRatio: 0,
            violationReason: `Archive parsing error: ${readErr.message}`,
          });
        });
      });
    });
  }
}

export default ArchiveService;
