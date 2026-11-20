import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { CryptoService } from '../src/services/crypto.service.js';
import config from '../src/config/index.js';

describe('Phase 3: Cryptography & AES-256-GCM Envelope Encryption', () => {
  const testDir = path.resolve(config.STORAGE_QUARANTINE_DIR, 'crypto_tests');
  const samplePlaintext = 'Cloud Computing Capstone Project: Sensitive VIT Student Document Content 2026.';

  beforeAll(async () => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(async () => {
    if (fs.existsSync(testDir)) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
  });

  it('SEC-10: Physical file on disk is unreadable ciphertext; restored file is byte-identical', async () => {
    const rawFilePath = path.join(testDir, 'original.txt');
    await fs.promises.writeFile(rawFilePath, samplePlaintext, 'utf-8');

    const storageUuid = uuidv4();
    const meta = await CryptoService.encryptAndStore(rawFilePath, storageUuid);

    // 1. Verify encrypted file on disk is NOT plaintext
    const ciphertextOnDisk = await fs.promises.readFile(meta.vaultFilePath);
    expect(ciphertextOnDisk.toString('utf-8')).not.toContain(samplePlaintext);
    expect(ciphertextOnDisk.length).toBeGreaterThan(0);

    // 2. Decrypt ciphertext back to memory
    const decryptedBuffer = await CryptoService.decryptToBuffer(
      meta.vaultFilePath,
      meta.encryptedDek,
      meta.iv,
      meta.authTag
    );

    const decryptedText = decryptedBuffer.toString('utf-8');
    expect(decryptedText).toBe(samplePlaintext);

    // 3. Cryptographic SHA-256 integrity match
    const decryptedHash = crypto.createHash('sha256').update(decryptedBuffer).digest('hex');
    expect(decryptedHash).toBe(meta.sha256Hash);

    // Clean up vault file
    if (fs.existsSync(meta.vaultFilePath)) {
      fs.unlinkSync(meta.vaultFilePath);
    }
  });

  it('Detects ciphertext tampering via GCM authentication tag verification', async () => {
    const rawFilePath = path.join(testDir, 'tamper_test.txt');
    await fs.promises.writeFile(rawFilePath, 'Original Untampered Data', 'utf-8');

    const storageUuid = uuidv4();
    const meta = await CryptoService.encryptAndStore(rawFilePath, storageUuid);

    // Tamper with the ciphertext on disk (flip 1 byte)
    const ciphertext = await fs.promises.readFile(meta.vaultFilePath);
    ciphertext[0] = ciphertext[0] ^ 0xff; // Invert first byte
    await fs.promises.writeFile(meta.vaultFilePath, ciphertext);

    // Attempting to decrypt tampered ciphertext must throw an authentication tag error!
    await expect(
      CryptoService.decryptToBuffer(
        meta.vaultFilePath,
        meta.encryptedDek,
        meta.iv,
        meta.authTag
      )
    ).rejects.toThrow();

    if (fs.existsSync(meta.vaultFilePath)) {
      fs.unlinkSync(meta.vaultFilePath);
    }
  });
});
