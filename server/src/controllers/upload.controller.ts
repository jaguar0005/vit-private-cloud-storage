import { Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import Busboy from 'busboy';
import prisma from '../db/prisma.js';
import config from '../config/index.js';
import { ChunkService } from '../services/chunk.service.js';
import { CryptoService } from '../services/crypto.service.js';
import { UploadPipelineService, PipelineViolationError } from '../services/pipeline.service.js';
import type { AuthenticatedRequest } from '../types/index.js';

export class UploadController {
  /**
   * POST /api/v1/files/upload
   * Streams incoming upload directly to /storage/quarantine and routes through 9-stage pipeline
   */
  public static async uploadDirect(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const busboy = Busboy({
        headers: req.headers,
        limits: {
          fileSize: config.MAX_FILE_SIZE_BYTES,
          files: 1,
        },
      });

      let folderId: string | null = null;
      let originalFilename = 'unnamed_file';
      let mimeType = 'application/octet-stream';
      let totalBytesWritten = 0;
      let quarantineUuid = uuidv4();
      let quarantineFilePath = path.resolve(config.STORAGE_QUARANTINE_DIR, `${quarantineUuid}.tmp`);
      let clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      busboy.on('field', (name, val) => {
        if (name === 'folderId' && val) folderId = val;
      });

      busboy.on('file', async (_name, fileStream, info) => {
        originalFilename = info.filename;
        mimeType = info.mimeType;

        const writeStream = fs.createWriteStream(quarantineFilePath);

        fileStream.on('data', (data: Buffer) => {
          totalBytesWritten += data.length;
          // Streaming size bound enforcement (Stage 1)
          if (totalBytesWritten > config.MAX_FILE_SIZE_BYTES) {
            fileStream.destroy(new Error(`File size exceeds maximum limit of ${config.MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`));
          }
        });

        fileStream.on('error', (streamErr) => {
          writeStream.destroy();
          if (fs.existsSync(quarantineFilePath)) fs.unlinkSync(quarantineFilePath);
          res.status(400).json({ success: false, error: { code: 'STREAM_ABORTED', message: streamErr.message } });
        });

        fileStream.pipe(writeStream);

        writeStream.on('finish', async () => {
          try {
            // Execute strict 9-stage upload defense pipeline
            const pipelineResult = await UploadPipelineService.executePipeline({
              userId: req.user!.id,
              originalFilename,
              mimeType,
              quarantineFilePath,
              fileSizeBytes: totalBytesWritten,
              folderId,
              clientIp,
            });

            res.status(201).json({
              success: true,
              data: {
                file: pipelineResult,
              },
              message: 'File successfully inspected, encrypted, and saved in vault.',
            });
          } catch (err: unknown) {
            const isSecurityViolation = err instanceof PipelineViolationError;
            const message = err instanceof Error ? err.message : 'Pipeline inspection failed.';
            res.status(isSecurityViolation ? 422 : 400).json({
              success: false,
              error: {
                code: isSecurityViolation ? 'SECURITY_PIPELINE_VIOLATION' : 'UPLOAD_FAILED',
                message,
                details: isSecurityViolation ? { stage: (err as PipelineViolationError).stage } : undefined,
              },
            });
          }
        });
      });

      req.pipe(busboy);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/files/upload/chunk
   * Handles resumable chunk uploads and processes assembled files through 9-stage pipeline
   */
  public static async uploadChunk(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const busboy = Busboy({ headers: req.headers });
      let uploadId = '';
      let chunkIndex = 0;
      let totalChunks = 1;
      let fileName = 'file';
      let fileSize = 0;
      let folderId: string | null = null;
      let chunkBuffer: Buffer | null = null;
      let clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      busboy.on('field', (name, val) => {
        if (name === 'uploadId') uploadId = val;
        if (name === 'chunkIndex') chunkIndex = parseInt(val, 10);
        if (name === 'totalChunks') totalChunks = parseInt(val, 10);
        if (name === 'fileName') fileName = val;
        if (name === 'fileSize') fileSize = parseInt(val, 10);
        if (name === 'folderId' && val) folderId = val;
      });

      busboy.on('file', (_name, fileStream) => {
        const chunks: Buffer[] = [];
        fileStream.on('data', (d: Buffer) => chunks.push(d));
        fileStream.on('end', () => {
          chunkBuffer = Buffer.concat(chunks);
        });
      });

      busboy.on('finish', async () => {
        try {
          if (!uploadId || chunkBuffer === null) {
            res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Missing chunk metadata.' } });
            return;
          }

          // Save chunk piece
          await ChunkService.saveChunk(uploadId, chunkIndex, chunkBuffer);
          const uploadedChunks = await ChunkService.getUploadedChunks(uploadId);

          // If all chunks received, assemble and run 9-stage pipeline
          if (uploadedChunks.length === totalChunks) {
            const assembled = await ChunkService.assembleChunks(uploadId, totalChunks);

            const pipelineResult = await UploadPipelineService.executePipeline({
              userId: req.user!.id,
              originalFilename: fileName,
              mimeType: 'application/octet-stream',
              quarantineFilePath: assembled.quarantinePath,
              fileSizeBytes: assembled.totalBytes,
              folderId,
              clientIp,
            });

            res.status(201).json({
              success: true,
              data: {
                completed: true,
                file: pipelineResult,
              },
              message: 'All chunks assembled, validated through security pipeline, and encrypted in vault.',
            });
            return;
          }

          res.status(200).json({
            success: true,
            data: {
              completed: false,
              chunkIndex,
              uploadedChunks,
            },
          });
        } catch (err: unknown) {
          const isSecurityViolation = err instanceof PipelineViolationError;
          const message = err instanceof Error ? err.message : 'Chunk processing failed.';
          res.status(isSecurityViolation ? 422 : 400).json({
            success: false,
            error: {
              code: isSecurityViolation ? 'SECURITY_PIPELINE_VIOLATION' : 'CHUNK_FAILED',
              message,
            },
          });
        }
      });

      req.pipe(busboy);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/files/:id/download
   * Streams decrypted file on-the-fly with strict security headers
   */
  public static async download(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findFirst({
        where: { id, user_id: req.user!.id, deleted_at: null },
      });

      if (!file) {
        res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'File not found.' } });
        return;
      }

      const vaultFilePath = path.resolve(config.STORAGE_VAULT_DIR, `${file.storage_uuid}.enc`);
      if (!fs.existsSync(vaultFilePath)) {
        res.status(404).json({ success: false, error: { code: 'VAULT_OBJECT_MISSING', message: 'Encrypted object missing from storage vault.' } });
        return;
      }

      // Mandatory Security Download & Preview Headers
      const sanitizedName = file.name.replace(/["\r\n]/g, '_');
      const isInline = req.query.inline === 'true';
      res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${sanitizedName}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // Accurately determine Content-Type
      let mimeType = file.mime_type || 'application/octet-stream';
      const fileExt = path.extname(file.name).toLowerCase();
      if (fileExt === '.pdf') mimeType = 'application/pdf';
      else if (fileExt === '.png') mimeType = 'image/png';
      else if (fileExt === '.jpg' || fileExt === '.jpeg') mimeType = 'image/jpeg';
      else if (fileExt === '.svg') mimeType = 'image/svg+xml';
      else if (fileExt === '.webp') mimeType = 'image/webp';
      else if (fileExt === '.gif') mimeType = 'image/gif';
      else if (fileExt === '.txt' || fileExt === '.log') mimeType = 'text/plain; charset=utf-8';
      else if (fileExt === '.csv') mimeType = 'text/csv; charset=utf-8';
      else if (fileExt === '.json') mimeType = 'application/json';
      else if (fileExt === '.md') mimeType = 'text/markdown; charset=utf-8';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', file.size_bytes.toString());

      // Stream decrypted ciphertext on-the-fly
      const decryptedStream = CryptoService.createDecryptedStream(
        vaultFilePath,
        file.encrypted_dek,
        file.iv,
        file.auth_tag
      );

      decryptedStream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/files/:id/rename
   */
  public static async rename(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Filename is required.' } });
        return;
      }

      const file = await prisma.file.findFirst({
        where: { id, user_id: req.user!.id, deleted_at: null },
      });
      if (!file) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found.' } });
        return;
      }

      const updated = await prisma.file.update({
        where: { id },
        data: { name: name.trim() },
      });

      res.status(200).json({ success: true, data: updated, message: 'File renamed successfully.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/files/:id/move
   */
  public static async move(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { folderId } = req.body;

      if (folderId) {
        const folder = await prisma.folder.findFirst({
          where: { id: folderId, user_id: req.user!.id, deleted_at: null },
        });
        if (!folder) {
          res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Target folder not found.' } });
          return;
        }
      }

      const updated = await prisma.file.update({
        where: { id },
        data: { folder_id: folderId || null },
      });

      res.status(200).json({ success: true, data: updated, message: 'File moved successfully.' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/files/:id
   * Soft-delete file (move to Recycle Bin)
   */
  public static async softDelete(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const file = await prisma.file.findFirst({
        where: { id, user_id: req.user!.id, deleted_at: null },
      });
      if (!file) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File not found.' } });
        return;
      }

      await prisma.file.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      res.status(200).json({ success: true, message: 'File moved to Recycle Bin.' });
    } catch (err) {
      next(err);
    }
  }
}

export default UploadController;
