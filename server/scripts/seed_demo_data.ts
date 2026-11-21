import crypto from 'node:crypto';
import prisma from '../src/db/prisma.js';
import { CryptoService } from '../src/services/crypto.service.js';

async function seed() {
  console.log('Seeding rich demonstration data for presentation...');

  // Clean old demonstration records
  await prisma.auditLog.deleteMany({});
  await prisma.quarantineLog.deleteMany({});
  await prisma.fileVersion.deleteMany({});
  await prisma.file.deleteMany({});
  await prisma.folder.deleteMany({});

  // 1. Create Users
  const student = await prisma.user.upsert({
    where: { email: 'anand.jayshree24@vit.edu' },
    update: {
      used_bytes: BigInt(16616720),
    },
    create: {
      email: 'anand.jayshree24@vit.edu',
      role: 'STUDENT',
      quota_bytes: BigInt(209715200), // 200 MB
      used_bytes: BigInt(16616720),
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@vit.edu' },
    update: {},
    create: {
      email: 'admin@vit.edu',
      role: 'ADMIN',
      quota_bytes: BigInt(1073741824), // 1 GB Admin Quota
      used_bytes: BigInt(0),
    },
  });

  const student2 = await prisma.user.upsert({
    where: { email: 'jay.gaur24@vit.edu' },
    update: {},
    create: {
      email: 'jay.gaur24@vit.edu',
      role: 'STUDENT',
      quota_bytes: BigInt(209715200),
      used_bytes: BigInt(0),
    },
  });

  // 2. Create Folders
  const folderDocs = await prisma.folder.create({
    data: {
      name: 'Cloud Coursework',
      user_id: student.id,
    },
  });

  const folderImages = await prisma.folder.create({
    data: {
      name: 'Project Assets',
      user_id: student.id,
    },
  });

  // 3. Helper to wrap a random DEK
  const makeEnvelope = () => {
    const rawDek = crypto.randomBytes(32);
    const iv = crypto.randomBytes(12);
    const authTag = crypto.randomBytes(16);
    const wrapped = CryptoService.wrapDek(rawDek);
    return {
      encrypted_dek: wrapped.encryptedDek,
      iv: iv.toString('base64'),
      auth_tag: authTag.toString('base64'),
    };
  };

  // 4. Create Files
  const meta1 = makeEnvelope();
  const file1 = await prisma.file.create({
    data: {
      name: 'unit1.pptx',
      storage_uuid: '8a69fa7a-85fe-4673-abe1-aa7e36aa4aaf',
      mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      size_bytes: BigInt(8488034),
      sha256_hash: crypto.createHash('sha256').update('unit1.pptx').digest('hex'),
      encrypted_dek: meta1.encrypted_dek,
      iv: meta1.iv,
      auth_tag: meta1.auth_tag,
      folder_id: folderDocs.id,
      user_id: student.id,
    },
  });

  const meta2 = makeEnvelope();
  const file2 = await prisma.file.create({
    data: {
      name: 'Image1.jpg',
      storage_uuid: '8b49ed1b-cfa4-43a8-bbab-349a4a24863f',
      mime_type: 'image/jpeg',
      size_bytes: BigInt(2193342),
      sha256_hash: crypto.createHash('sha256').update('Image1.jpg').digest('hex'),
      encrypted_dek: meta2.encrypted_dek,
      iv: meta2.iv,
      auth_tag: meta2.auth_tag,
      folder_id: folderImages.id,
      user_id: student.id,
    },
  });

  const meta3 = makeEnvelope();
  await prisma.file.create({
    data: {
      name: 'IMG_20260810_095658.jpg',
      storage_uuid: '85b6eeb9-0550-4173-adbc-5557a5062c5d',
      mime_type: 'image/jpeg',
      size_bytes: BigInt(5935344),
      sha256_hash: crypto.createHash('sha256').update('IMG_20260810_095658.jpg').digest('hex'),
      encrypted_dek: meta3.encrypted_dek,
      iv: meta3.iv,
      auth_tag: meta3.auth_tag,
      user_id: student.id,
      deleted_at: new Date(), // in Recycle bin
    },
  });

  // 5. File Versions
  await prisma.fileVersion.create({
    data: {
      file_id: file1.id,
      version_number: 1,
      storage_uuid: '8a69fa7a-85fe-4673-abe1-aa7e36aa4aaf',
      size_bytes: BigInt(8488034),
      sha256_hash: crypto.createHash('sha256').update('unit1_v1').digest('hex'),
      encrypted_dek: meta1.encrypted_dek,
      iv: meta1.iv,
      auth_tag: meta1.auth_tag,
    },
  });

  // 6. Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        action: 'USER_LOGIN_OTP_VERIFIED',
        user_id: student.id,
        ip_address: '127.0.0.1',
        details: { method: 'EMAIL_OTP', device: 'Chrome / Windows 11' },
      },
      {
        action: 'FILE_UPLOAD',
        user_id: student.id,
        resource_id: file1.id,
        ip_address: '127.0.0.1',
        details: { name: 'unit1.pptx', sizeBytes: 8488034, pipeline: 'PASSED_ALL_9_STAGES' },
      },
      {
        action: 'FILE_UPLOAD',
        user_id: student.id,
        resource_id: file2.id,
        ip_address: '127.0.0.1',
        details: { name: 'Image1.jpg', sizeBytes: 2193342, crypto: 'AES-256-GCM' },
      },
      {
        action: 'ADMIN_QUOTA_OVERRIDE',
        user_id: admin.id,
        resource_id: student.id,
        ip_address: '127.0.0.1',
        details: { previousQuotaMb: 100, newQuotaMb: 200, reason: 'Capstone Grant' },
      },
    ],
  });

  // 7. Quarantine Log (Demonstrates Security Pipeline in Viva)
  await prisma.quarantineLog.create({
    data: {
      original_name: 'malicious_script.bat',
      violation_reason: 'STAGE_4_BLOCKED_EXTENSION: Executable script prohibited',
      size_bytes: BigInt(1024),
      ip_address: '192.168.1.105',
      user_id: student2.id,
      resolved: false,
    },
  });

  console.log('Seeding completed successfully!');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
