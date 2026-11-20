import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import config from '../config/index.js';

export class ChunkService {
  /**
   * Returns directory path for a chunked upload session
   */
  public static getSessionDir(uploadId: string): string {
    const dir = path.resolve(config.STORAGE_CHUNKS_DIR, uploadId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Writes a chunk buffer to disk
   */
  public static async saveChunk(
    uploadId: string,
    chunkIndex: number,
    chunkBuffer: Buffer
  ): Promise<string> {
    const sessionDir = this.getSessionDir(uploadId);
    const chunkPath = path.join(sessionDir, `chunk_${chunkIndex.toString().padStart(6, '0')}.part`);
    await fs.promises.writeFile(chunkPath, chunkBuffer);
    return chunkPath;
  }

  /**
   * Lists already received chunk indices for a session (enables resumable uploads)
   */
  public static async getUploadedChunks(uploadId: string): Promise<number[]> {
    const sessionDir = path.resolve(config.STORAGE_CHUNKS_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      return [];
    }

    const files = await fs.promises.readdir(sessionDir);
    const indices: number[] = [];

    for (const file of files) {
      const match = file.match(/^chunk_(\d+)\.part$/);
      if (match) {
        indices.push(parseInt(match[1], 10));
      }
    }

    return indices.sort((a, b) => a - b);
  }

  /**
   * Assembles all chunks in numerical order into an assembled quarantine staging file
   */
  public static async assembleChunks(
    uploadId: string,
    totalChunks: number
  ): Promise<{ quarantinePath: string; quarantineUuid: string; totalBytes: number }> {
    const sessionDir = path.resolve(config.STORAGE_CHUNKS_DIR, uploadId);
    const quarantineUuid = uuidv4();
    const quarantinePath = path.resolve(config.STORAGE_QUARANTINE_DIR, `${quarantineUuid}.tmp`);

    const writeStream = fs.createWriteStream(quarantinePath, { flags: 'w' });
    let totalBytes = 0;

    for (let i = 0; i < totalChunks; i++) {
      const chunkFile = path.join(sessionDir, `chunk_${i.toString().padStart(6, '0')}.part`);
      if (!fs.existsSync(chunkFile)) {
        writeStream.destroy();
        if (fs.existsSync(quarantinePath)) {
          fs.unlinkSync(quarantinePath);
        }
        throw new Error(`Missing chunk index ${i} of ${totalChunks} for upload session ${uploadId}.`);
      }

      const chunkBuffer = await fs.promises.readFile(chunkFile);
      totalBytes += chunkBuffer.length;
      writeStream.write(chunkBuffer);
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Clean up temporary chunk pieces
    try {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
    } catch {
      // Ignore directory cleanup error
    }

    return {
      quarantinePath,
      quarantineUuid,
      totalBytes,
    };
  }
}

export default ChunkService;
