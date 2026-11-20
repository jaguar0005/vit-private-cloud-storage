import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import prisma from '../src/db/prisma.js';
import config from '../src/config/index.js';
import { ensureDatabaseAvailable } from '../src/db/embeddedPg.js';
import { UploadPipelineService } from '../src/services/pipeline.service.js';

describe('Phase 3: 9-Stage Upload Defense Pipeline & Security Verifications', () => {
  let studentId: string;
  const testStagingDir = path.resolve(config.STORAGE_QUARANTINE_DIR, 'pipeline_test_staging');

  // Helper to build custom test ZIP archives with precise Central Directory headers
  function createTestZipBuffer(filename: string, uncompressedContent: Buffer): Buffer {
    const compressed = zlib.deflateRawSync(uncompressedContent);
    const crc = 0x12345678;

    // Local File Header
    const lfh = Buffer.alloc(30 + filename.length);
    lfh.write('PK\x03\x04', 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(0, 6);
    lfh.writeUInt16LE(8, 8);
    lfh.writeUInt32LE(0, 10);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressed.length, 18);
    lfh.writeUInt32LE(uncompressedContent.length, 22);
    lfh.writeUInt16LE(filename.length, 26);
    lfh.writeUInt16LE(0, 28);
    lfh.write(filename, 30);

    // Central Directory Header
    const cdh = Buffer.alloc(46 + filename.length);
    cdh.write('PK\x01\x02', 0);
    cdh.writeUInt16LE(20, 4);
    cdh.writeUInt16LE(20, 6);
    cdh.writeUInt16LE(0, 8);
    cdh.writeUInt16LE(8, 10);
    cdh.writeUInt32LE(0, 12);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(compressed.length, 20);
    cdh.writeUInt32LE(uncompressedContent.length, 24);
    cdh.writeUInt16LE(filename.length, 28);
    cdh.writeUInt16LE(0, 30);
    cdh.writeUInt16LE(0, 32);
    cdh.writeUInt16LE(0, 34);
    cdh.writeUInt16LE(0, 36);
    cdh.writeUInt32LE(0, 38);
    cdh.writeUInt32LE(0, 42);
    cdh.write(filename, 46);

    // End of Central Directory
    const eocd = Buffer.alloc(22);
    eocd.write('PK\x05\x06', 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(1, 8);
    eocd.writeUInt16LE(1, 10);
    eocd.writeUInt32LE(cdh.length, 12);
    eocd.writeUInt32LE(lfh.length + compressed.length, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([lfh, compressed, cdh, eocd]);
  }

  beforeAll(async () => {
    await ensureDatabaseAvailable();
    if (!fs.existsSync(testStagingDir)) {
      fs.mkdirSync(testStagingDir, { recursive: true });
    }

    const student = await prisma.user.upsert({
      where: { email: 'security.student@vit.edu' },
      update: { used_bytes: BigInt(0) },
      create: {
        email: 'security.student@vit.edu',
        role: 'STUDENT',
        quota_bytes: BigInt(config.DEFAULT_USER_QUOTA_BYTES),
        used_bytes: BigInt(0),
      },
    });
    studentId = student.id;
  });

  afterAll(async () => {
    if (fs.existsSync(testStagingDir)) {
      await fs.promises.rm(testStagingDir, { recursive: true, force: true });
    }
    await prisma.quarantineLog.deleteMany({ where: { user_id: studentId } });
    await prisma.file.deleteMany({ where: { user_id: studentId } });
    await prisma.user.deleteMany({ where: { id: studentId } });
  });

  it('Stage 4: Intercepts forbidden script/executable extension', async () => {
    const testFile = path.join(testStagingDir, 'malicious.sh');
    await fs.promises.writeFile(testFile, 'echo "rm -rf /"');

    await expect(
      UploadPipelineService.executePipeline({
        userId: studentId,
        originalFilename: 'malicious.sh',
        mimeType: 'text/x-shellscript',
        quarantineFilePath: testFile,
        fileSizeBytes: 16,
      })
    ).rejects.toThrow(/Forbidden executable or script extension/i);

    // Verify logged in QuarantineLog
    const logged = await prisma.quarantineLog.findFirst({
      where: { user_id: studentId, original_name: 'malicious.sh' },
      orderBy: { created_at: 'desc' },
    });
    expect(logged).toBeDefined();
    expect(logged?.violation_reason).toContain('Forbidden executable');
  });

  it('SEC-07: Intercepts renamed executable disguised as PDF (Magic Bytes Stage 5)', async () => {
    const testFile = path.join(testStagingDir, 'disguised.pdf');
    const fakePdf = Buffer.concat([Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), Buffer.alloc(100)]);
    await fs.promises.writeFile(testFile, fakePdf);

    await expect(
      UploadPipelineService.executePipeline({
        userId: studentId,
        originalFilename: 'disguised.pdf',
        mimeType: 'application/pdf',
        quarantineFilePath: testFile,
        fileSizeBytes: fakePdf.length,
      })
    ).rejects.toThrow(/Magic bytes mismatch/i);

    const logged = await prisma.quarantineLog.findFirst({
      where: { user_id: studentId, original_name: 'disguised.pdf' },
      orderBy: { created_at: 'desc' },
    });
    expect(logged).toBeDefined();
    expect(logged?.violation_reason).toContain('Magic bytes mismatch');
  });

  it('SEC-06: Intercepts ZIP archive containing Path-Traversal / Zip-Slip (Stage 6)', async () => {
    const testFile = path.join(testStagingDir, 'zip_slip.zip');
    const zipBuf = createTestZipBuffer('../../etc/passwd', Buffer.from('malicious payload'));
    await fs.promises.writeFile(testFile, zipBuf);

    await expect(
      UploadPipelineService.executePipeline({
        userId: studentId,
        originalFilename: 'zip_slip.zip',
        mimeType: 'application/zip',
        quarantineFilePath: testFile,
        fileSizeBytes: zipBuf.length,
      })
    ).rejects.toThrow(/(Path traversal|invalid relative path)/i);

    const logged = await prisma.quarantineLog.findFirst({
      where: { user_id: studentId, original_name: 'zip_slip.zip' },
      orderBy: { created_at: 'desc' },
    });
    expect(logged).toBeDefined();
    expect(logged?.violation_reason).toMatch(/(Path traversal|invalid relative path)/i);
  });

  it('SEC-05: Intercepts High-Ratio Zip Bomb (Stage 6)', async () => {
    const testFile = path.join(testStagingDir, 'zip_bomb.zip');
    const largeZeroes = Buffer.alloc(2 * 1024 * 1024, 0);
    const zipBuf = createTestZipBuffer('massive_bomb.txt', largeZeroes);
    await fs.promises.writeFile(testFile, zipBuf);

    await expect(
      UploadPipelineService.executePipeline({
        userId: studentId,
        originalFilename: 'zip_bomb.zip',
        mimeType: 'application/zip',
        quarantineFilePath: testFile,
        fileSizeBytes: zipBuf.length,
      })
    ).rejects.toThrow(/Abnormal compression ratio/i);

    const logged = await prisma.quarantineLog.findFirst({
      where: { user_id: studentId, original_name: 'zip_bomb.zip' },
      orderBy: { created_at: 'desc' },
    });
    expect(logged).toBeDefined();
    expect(logged?.violation_reason).toContain('Zip Bomb');
  });

  it('SEC-04: Intercepts EICAR standard antivirus test signature (Stage 7)', async () => {
    const testFile = path.join(testStagingDir, 'eicar_test.txt');
    await fs.promises.writeFile(testFile, config.EICAR_SIGNATURE, 'utf-8');

    await expect(
      UploadPipelineService.executePipeline({
        userId: studentId,
        originalFilename: 'eicar_test.txt',
        mimeType: 'text/plain',
        quarantineFilePath: testFile,
        fileSizeBytes: config.EICAR_SIGNATURE.length,
      })
    ).rejects.toThrow(/Malware signature detected/i);

    const logged = await prisma.quarantineLog.findFirst({
      where: { user_id: studentId, original_name: 'eicar_test.txt' },
      orderBy: { created_at: 'desc' },
    });
    expect(logged).toBeDefined();
    expect(logged?.violation_reason).toContain('EICAR');
  });

  it('Stage 8: Passes clean file through all stages, encrypts, and commits to vault', async () => {
    const testFile = path.join(testStagingDir, 'lecture_notes.txt');
    const cleanContent = 'VIT Cloud Computing - Lecture 10: Multi-Tenancy and Quota Management';
    await fs.promises.writeFile(testFile, cleanContent, 'utf-8');

    const result = await UploadPipelineService.executePipeline({
      userId: studentId,
      originalFilename: 'lecture_notes.txt',
      mimeType: 'text/plain',
      quarantineFilePath: testFile,
      fileSizeBytes: cleanContent.length,
    });

    expect(result.fileId).toBeDefined();
    expect(result.name).toBe('lecture_notes.txt');
    expect(result.storageUuid).toBeDefined();

    const vaultPath = path.resolve(config.STORAGE_VAULT_DIR, `${result.storageUuid}.enc`);
    expect(fs.existsSync(vaultPath)).toBe(true);
    expect(fs.existsSync(testFile)).toBe(false);

    if (fs.existsSync(vaultPath)) fs.unlinkSync(vaultPath);
  });
});
