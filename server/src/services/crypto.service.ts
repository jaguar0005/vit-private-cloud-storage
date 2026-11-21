import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';


export interface EnvelopeMetadata {
  storageUuid: string;
  vaultFilePath: string;
  encryptedDek: string;  // Base64-encoded DEK wrapped with Master Key
  iv: string;            // Base64-encoded 12-byte IV for file payload
  authTag: string;       // Base64-encoded 16-byte GCM authentication tag
  sha256Hash: string;    // Plaintext SHA-256 checksum
  sizeBytes: number;
}

export class CryptoService {
  private static getMasterKeyBuffer(): Buffer {
    // 256-bit (32 bytes) master key from environment
    return Buffer.from(config.STORAGE_MASTER_KEY, 'hex');
  }

  /**
   * Wraps (encrypts) a 256-bit Data Encryption Key (DEK) using the Master Key via AES-256-GCM
   */
  public static wrapDek(dek: Buffer): { encryptedDek: string; dekIv: string; dekTag: string } {
    const masterKey = this.getMasterKeyBuffer();
    const dekIv = crypto.randomBytes(12); // 96-bit IV
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, dekIv);

    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const dekTag = cipher.getAuthTag();

    return {
      encryptedDek: Buffer.concat([dekIv, dekTag, encrypted]).toString('base64'),
      dekIv: dekIv.toString('base64'),
      dekTag: dekTag.toString('base64'),
    };
  }

  /**
   * Unwraps (decrypts) an encrypted DEK using the Master Key via AES-256-GCM
   */
  public static unwrapDek(wrappedDekBase64: string): Buffer {
    const masterKey = this.getMasterKeyBuffer();
    const rawBuffer = Buffer.from(wrappedDekBase64, 'base64');

    // Layout: 12-byte IV + 16-byte AuthTag + Ciphertext
    const dekIv = rawBuffer.subarray(0, 12);
    const dekTag = rawBuffer.subarray(12, 28);
    const ciphertext = rawBuffer.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, dekIv);
    decipher.setAuthTag(dekTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Encrypts a source file stream using AES-256-GCM envelope encryption and writes ciphertext to /storage/vault/<storageUuid>.enc
   */
  public static async encryptAndStore(
    sourceFilePath: string,
    storageUuid: string
  ): Promise<EnvelopeMetadata> {
    const dek = crypto.randomBytes(32); // 256-bit unique DEK per file
    const iv = crypto.randomBytes(12);   // 96-bit unique IV

    const wrapped = this.wrapDek(dek);

    const vaultFilePath = path.resolve(config.STORAGE_VAULT_DIR, `${storageUuid}.enc`);
    const vaultDir = path.dirname(vaultFilePath);
    if (!fs.existsSync(vaultDir)) {
      fs.mkdirSync(vaultDir, { recursive: true });
    }

    const readStream = fs.createReadStream(sourceFilePath);
    const writeStream = fs.createWriteStream(vaultFilePath);

    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const hash = crypto.createHash('sha256');

    let totalBytes = 0;

    await new Promise<void>((resolve, reject) => {
      let readDone = false;
      let writeDone = false;

      const finishIfReady = () => {
        if (readDone && writeDone) resolve();
      };

      readStream.on('data', (chunk: Buffer | string) => {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buf.length;
        hash.update(buf);
        const encryptedChunk = cipher.update(buf);
        if (encryptedChunk.length > 0) {
          writeStream.write(encryptedChunk);
        }
      });

      readStream.on('error', (err) => reject(err));
      writeStream.on('error', (err) => reject(err));

      readStream.on('end', () => {
        const finalChunk = cipher.final();
        if (finalChunk.length > 0) {
          writeStream.write(finalChunk);
        }
        writeStream.end();
      });

      readStream.on('close', () => {
        readDone = true;
        finishIfReady();
      });

      writeStream.on('finish', () => {
        writeDone = true;
        if (!readDone) {
          readStream.destroy();
        }
        finishIfReady();
      });
    });

    const authTag = cipher.getAuthTag();
    const sha256Hash = hash.digest('hex');

    return {
      storageUuid,
      vaultFilePath,
      encryptedDek: wrapped.encryptedDek,
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      sha256Hash,
      sizeBytes: totalBytes,
    };
  }

  /**
   * Creates a decrypted readable stream on-the-fly for downloading or previewing
   */
  public static createDecryptedStream(
    vaultFilePath: string,
    encryptedDekBase64: string,
    ivBase64: string,
    authTagBase64: string
  ): fs.ReadStream {
    const dek = this.unwrapDek(encryptedDekBase64);
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);

    const cipherStream = fs.createReadStream(vaultFilePath);
    return cipherStream.pipe(decipher) as unknown as fs.ReadStream;
  }

  /**
   * Decrypts an encrypted file in memory and returns a Buffer (useful for previews and tests)
   */
  public static async decryptToBuffer(
    vaultFilePath: string,
    encryptedDekBase64: string,
    ivBase64: string,
    authTagBase64: string
  ): Promise<Buffer> {
    const dek = this.unwrapDek(encryptedDekBase64);
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');

    const encryptedData = await fs.promises.readFile(vaultFilePath);

    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
  }
}

export default CryptoService;
