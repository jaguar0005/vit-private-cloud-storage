import fs from 'node:fs';
import path from 'node:path';
import prisma from '../src/db/prisma.js';

async function exportDatabase() {
  console.log('Exporting database tables...');

  const users = await prisma.user.findMany();
  const files = await prisma.file.findMany();
  const folders = await prisma.folder.findMany();
  const versions = await prisma.fileVersion.findMany();
  const auditLogs = await prisma.auditLog.findMany();
  const quarantineLogs = await prisma.quarantineLog.findMany();

  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      system: 'VIT Private Cloud Storage Database',
      totalUsers: users.length,
      totalFiles: files.length,
      totalAuditLogs: auditLogs.length,
    },
    tables: {
      users,
      files,
      folders,
      versions,
      auditLogs,
      quarantineLogs,
    }
  };

  const outDir = path.resolve('./storage');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Write JSON
  const jsonPath = path.join(outDir, 'database_export.json');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(exportData, (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 2),
    'utf-8'
  );
  console.log('Exported JSON to:', jsonPath);

  // 2. Write SQL Inserts
  const sqlPath = path.join(outDir, 'database_backup.sql');
  let sqlContent = `-- ========================================================\n`;
  sqlContent += `-- VIT Private Cloud Storage Database Dump\n`;
  sqlContent += `-- Exported: ${new Date().toISOString()}\n`;
  sqlContent += `-- ========================================================\n\n`;

  sqlContent += `-- USERS (${users.length} records)\n`;
  for (const u of users) {
    sqlContent += `INSERT INTO "User" (id, email, role, quota_bytes, used_bytes, created_at) VALUES ('${u.id}', '${u.email}', '${u.role}', ${u.quota_bytes}, ${u.used_bytes}, '${u.created_at.toISOString()}');\n`;
  }

  sqlContent += `\n-- FILES (${files.length} records)\n`;
  for (const f of files) {
    sqlContent += `INSERT INTO "File" (id, name, storage_uuid, size_bytes, mime_type, user_id, created_at) VALUES ('${f.id}', '${f.name}', '${f.storage_uuid}', ${f.size_bytes}, '${f.mime_type}', '${f.user_id}', '${f.created_at.toISOString()}');\n`;
  }

  sqlContent += `\n-- AUDIT LOGS (${auditLogs.length} records)\n`;
  for (const a of auditLogs.slice(0, 50)) {
    sqlContent += `INSERT INTO "AuditLog" (id, action, user_id, ip_address, created_at) VALUES ('${a.id}', '${a.action}', '${a.user_id || 'SYSTEM'}', '${a.ip_address}', '${a.created_at.toISOString()}');\n`;
  }

  fs.writeFileSync(sqlPath, sqlContent, 'utf-8');
  console.log('Exported SQL to:', sqlPath);

  console.log('Database export complete!');
  process.exit(0);
}

exportDatabase().catch(err => {
  console.error('Export error:', err);
  process.exit(1);
});
