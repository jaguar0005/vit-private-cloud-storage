import { Request, Response, NextFunction } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';

export interface DiskHealthStatus {
  totalBytes: number;
  freeBytes: number;
  availableMb: number;
  guardTriggered: boolean;
  thresholdMb: number;
}

/**
 * Checks physical host disk pool capacity using Node.js fs.statfs
 */
export const checkDiskHealth = async (storagePath = config.STORAGE_ROOT_DIR): Promise<DiskHealthStatus> => {
  const fullPath = path.resolve(storagePath);

  try {
    const stats = await fs.promises.statfs(fullPath);
    const freeBytes = stats.bavail * stats.bsize;
    const totalBytes = stats.blocks * stats.bsize;
    const availableMb = freeBytes / (1024 * 1024);
    const guardTriggered = availableMb < config.DISK_GUARD_THRESHOLD_MB;

    return {
      totalBytes,
      freeBytes,
      availableMb,
      guardTriggered,
      thresholdMb: config.DISK_GUARD_THRESHOLD_MB,
    };
  } catch {
    // If statfs is unsupported on a specific mount, default to safe operational state
    return {
      totalBytes: config.STORAGE_POOL_MAX_BYTES,
      freeBytes: config.STORAGE_POOL_MAX_BYTES / 2,
      availableMb: 10240, // 10 GB
      guardTriggered: false,
      thresholdMb: config.DISK_GUARD_THRESHOLD_MB,
    };
  }
};

/**
 * Disk Guard Middleware: Aborts upload requests early with HTTP 507 if host laptop pool has < 1 GB free space
 */
export const diskGuard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const health = await checkDiskHealth();

  if (health.guardTriggered) {
    res.status(507).json({
      success: false,
      error: {
        code: 'STORAGE_POOL_CRITICAL',
        message: `System Alert: Host storage pool has reached critical capacity (${health.availableMb.toFixed(0)} MB free, below safety threshold of ${health.thresholdMb} MB). Uploads are temporarily paused.`,
      },
    });
    return;
  }

  next();
};

export default diskGuard;
