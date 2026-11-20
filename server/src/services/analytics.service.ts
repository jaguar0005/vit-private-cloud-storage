import path from 'node:path';
import fs from 'node:fs';
import prisma from '../db/prisma.js';
import config from '../config/index.js';

const CATEGORY_MAP: Record<string, string[]> = {
  DOCUMENTS: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'pages', 'md', 'epub', 'xlsx', 'csv', 'pptx'],
  IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'tiff', 'ico'],
  MEDIA: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'mp3', 'wav', 'flac', 'aac', 'ogg'],
  ARCHIVES: ['zip', 'rar', 'tar', 'gz', 'bz2', '7z', 'xz'],
  CODE: ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'cs', 'html', 'css', 'json', 'yml', 'yaml', 'xml', 'sql', 'sh'],
};

export class AnalyticsService {
  /**
   * Computes personal storage telemetry metrics for an authenticated user
   */
  public static async getUserAnalytics(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { quota_bytes: true, used_bytes: true, email: true },
    });

    if (!user) {
      throw new Error('User not found.');
    }

    const [activeFiles, folders, versions, auditEvents] = await Promise.all([
      prisma.file.findMany({
        where: { user_id: userId, deleted_at: null },
        select: { name: true, size_bytes: true, mime_type: true },
      }),
      prisma.folder.count({
        where: { user_id: userId, deleted_at: null },
      }),
      prisma.fileVersion.findMany({
        where: { file: { user_id: userId } },
        select: { size_bytes: true },
      }),
      prisma.auditLog.findMany({
        where: {
          user_id: userId,
          created_at: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
        select: { action: true, created_at: true },
      }),
    ]);

    // Categorization breakdown
    const categories: Record<string, { count: number; bytes: bigint }> = {
      DOCUMENTS: { count: 0, bytes: BigInt(0) },
      IMAGES: { count: 0, bytes: BigInt(0) },
      MEDIA: { count: 0, bytes: BigInt(0) },
      ARCHIVES: { count: 0, bytes: BigInt(0) },
      CODE: { count: 0, bytes: BigInt(0) },
      OTHER: { count: 0, bytes: BigInt(0) },
    };

    for (const f of activeFiles) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      let matched = false;

      for (const [catName, extList] of Object.entries(CATEGORY_MAP)) {
        if (extList.includes(ext)) {
          categories[catName].count++;
          categories[catName].bytes += f.size_bytes;
          matched = true;
          break;
        }
      }

      if (!matched) {
        categories.OTHER.count++;
        categories.OTHER.bytes += f.size_bytes;
      }
    }

    // Version overhead calculation
    let versionOverheadBytes = BigInt(0);
    for (const v of versions) {
      versionOverheadBytes += v.size_bytes;
    }

    // Format 14-day activity timeline
    const activityMap: Record<string, { date: string; uploads: number; downloads: number; shares: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      activityMap[dateStr] = { date: dateStr, uploads: 0, downloads: 0, shares: 0 };
    }

    for (const event of auditEvents) {
      const dateStr = event.created_at.toISOString().split('T')[0];
      if (activityMap[dateStr]) {
        if (event.action === 'FILE_UPLOAD' || event.action === 'FILE_VERSION_UPLOAD') {
          activityMap[dateStr].uploads++;
        } else if (event.action === 'SHARE_DOWNLOAD') {
          activityMap[dateStr].downloads++;
        } else if (event.action === 'SHARE_CREATE') {
          activityMap[dateStr].shares++;
        }
      }
    }

    return {
      quota: {
        allocatedBytes: user.quota_bytes.toString(),
        usedBytes: user.used_bytes.toString(),
        freeBytes: (user.quota_bytes - user.used_bytes > BigInt(0) ? user.quota_bytes - user.used_bytes : BigInt(0)).toString(),
        usagePercentage: Math.min(100, Math.round((Number(user.used_bytes) / Number(user.quota_bytes)) * 100)),
      },
      counts: {
        activeFiles: activeFiles.length,
        folders,
        historicalVersions: versions.length,
      },
      versionOverheadBytes: versionOverheadBytes.toString(),
      categoryBreakdown: Object.entries(categories).map(([category, stats]) => ({
        category,
        count: stats.count,
        bytes: stats.bytes.toString(),
      })),
      recentActivity: Object.values(activityMap),
    };
  }

  /**
   * Computes system-wide 20 GB dedicated laptop storage pool and administrative health metrics
   */
  public static async getGlobalPoolAnalytics() {
    const poolAllocationCapBytes = BigInt(config.STORAGE_POOL_MAX_BYTES || 21474836480); // 20 GB dedicated pool

    const [totalUsers, userUsageRows, totalFiles, totalVersions, totalQuarantine, unresolvedThreats] = await Promise.all([
      prisma.user.count(),
      prisma.user.aggregate({
        _sum: { used_bytes: true },
      }),
      prisma.file.count({ where: { deleted_at: null } }),
      prisma.fileVersion.count(),
      prisma.quarantineLog.count(),
      prisma.quarantineLog.count({ where: { resolved: false } }),
    ]);

    const totalTenantConsumedBytes = userUsageRows._sum.used_bytes || BigInt(0);
    const poolAvailableBytes =
      poolAllocationCapBytes - totalTenantConsumedBytes > BigInt(0)
        ? poolAllocationCapBytes - totalTenantConsumedBytes
        : BigInt(0);

    const poolUtilizationPercent = Math.min(
      100,
      Math.round((Number(totalTenantConsumedBytes) / Number(poolAllocationCapBytes)) * 100)
    );

    return {
      pool: {
        capacityBytes: poolAllocationCapBytes.toString(),
        usedBytes: totalTenantConsumedBytes.toString(),
        freeBytes: poolAvailableBytes.toString(),
        utilizationPercent: poolUtilizationPercent,
        dedicatedPoolLimitGb: 20,
      },
      tenants: {
        totalRegistered: totalUsers,
        totalFiles,
        totalHistoricalVersions: totalVersions,
      },
      security: {
        totalQuarantined: totalQuarantine,
        unresolvedThreats,
      },
    };
  }
}

export default AnalyticsService;
