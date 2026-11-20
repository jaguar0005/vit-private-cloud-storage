import fs from 'node:fs';
import path from 'node:path';
import cron from 'node-cron';
import prisma from '../db/prisma.js';
import config from '../config/index.js';
import QuotaService from '../services/quota.service.js';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export class CleanupJob {
  /**
   * Executes all cleanup tasks synchronously and returns metrics
   */
  public static async runAllCleanupTasks() {
    const results = {
      purgedFiles: 0,
      purgedFolders: 0,
      bytesReclaimed: '0',
      orphanChunksCleaned: 0,
      deactivatedShares: 0,
    };

    const now = Date.now();
    const thirtyDaysAgo = new Date(now - THIRTY_DAYS_MS);

    // 1. Purge trashed files older than 30 days
    const expiredFiles = await prisma.file.findMany({
      where: {
        deleted_at: { lt: thirtyDaysAgo },
      },
      include: { versions: true },
    });

    let totalBytesReclaimed = BigInt(0);

    for (const f of expiredFiles) {
      let fileBytes = f.size_bytes;
      const activePath = path.resolve(config.STORAGE_VAULT_DIR, `${f.storage_uuid}.enc`);
      if (fs.existsSync(activePath)) {
        try {
          fs.unlinkSync(activePath);
        } catch (e) {
          console.error(`Cleanup failed unlinking ${activePath}:`, e);
        }
      }

      for (const v of f.versions) {
        fileBytes += v.size_bytes;
        const vPath = path.resolve(config.STORAGE_VAULT_DIR, `${v.storage_uuid}.enc`);
        if (fs.existsSync(vPath)) {
          try {
            fs.unlinkSync(vPath);
          } catch (e) {
            console.error(`Cleanup failed unlinking ${vPath}:`, e);
          }
        }
      }

      totalBytesReclaimed += fileBytes;

      // Release quota for user
      await QuotaService.releaseQuota(f.user_id, fileBytes);
    }

    if (expiredFiles.length > 0) {
      await prisma.file.deleteMany({
        where: { id: { in: expiredFiles.map((f) => f.id) } },
      });
      results.purgedFiles = expiredFiles.length;
      results.bytesReclaimed = totalBytesReclaimed.toString();
    }

    // 2. Purge trashed folders older than 30 days
    const expiredFolders = await prisma.folder.findMany({
      where: {
        deleted_at: { lt: thirtyDaysAgo },
      },
    });

    if (expiredFolders.length > 0) {
      await prisma.folder.deleteMany({
        where: { id: { in: expiredFolders.map((f) => f.id) } },
      });
      results.purgedFolders = expiredFolders.length;
    }

    // 3. Clean up orphaned chunk upload directories older than 24 hours
    const chunksDir = path.resolve(config.STORAGE_CHUNKS_DIR);
    if (fs.existsSync(chunksDir)) {
      try {
        const uploadDirs = fs.readdirSync(chunksDir);
        for (const dirName of uploadDirs) {
          const dirPath = path.join(chunksDir, dirName);
          const stat = fs.statSync(dirPath);
          if (stat.isDirectory() && now - stat.mtimeMs > TWENTY_FOUR_HOURS_MS) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            results.orphanChunksCleaned++;
          }
        }
      } catch (e) {
        console.error('Error scanning chunks directory for orphans:', e);
      }
    }

    // 4. Deactivate expired share links
    const expiredShares = await prisma.shareLink.updateMany({
      where: {
        is_active: true,
        expires_at: { lt: new Date() },
      },
      data: { is_active: false },
    });

    // Also deactivate shares where download_count >= max_downloads
    const maxedShares = await prisma.$executeRaw`
      UPDATE "ShareLink"
      SET is_active = false
      WHERE is_active = true
        AND max_downloads IS NOT NULL
        AND download_count >= max_downloads
    `;

    results.deactivatedShares = expiredShares.count + Number(maxedShares);

    return results;
  }

  /**
   * Initializes background cron schedules
   */
  public static initSchedules() {
    // Run daily at 02:00 AM server time
    cron.schedule('0 2 * * *', async () => {
      console.log('⏰ [Cron] Starting scheduled 30-day Recycle Bin and storage maintenance...');
      try {
        const stats = await CleanupJob.runAllCleanupTasks();
        console.log('✅ [Cron] Maintenance complete:', stats);
      } catch (err) {
        console.error('❌ [Cron] Error during maintenance run:', err);
      }
    });

    // Run hourly for orphaned chunks and expired shares
    cron.schedule('0 * * * *', async () => {
      try {
        await CleanupJob.runAllCleanupTasks();
      } catch (err) {
        console.error('❌ [Cron] Hourly maintenance check failed:', err);
      }
    });

    console.log('⏰ Storage maintenance cron jobs initialized (2 AM daily purge & hourly orphan check).');
  }
}

export default CleanupJob;
