import prisma from '../db/prisma.js';

export class QuotaExceededError extends Error {
  public remainingBytes: number;
  public attemptedBytes: number;

  constructor(message: string, remainingBytes: number, attemptedBytes: number) {
    super(message);
    this.name = 'QuotaExceededError';
    this.remainingBytes = remainingBytes;
    this.attemptedBytes = attemptedBytes;
  }
}

export class QuotaService {
  /**
   * Atomically verifies and reserves storage quota using PostgreSQL row-level locking (SELECT ... FOR UPDATE).
   * This guarantees that concurrent uploads cannot race and breach the student's 200 MB quota.
   */
  public static async reserveQuota(userId: string, incomingBytes: number): Promise<{ reserved: boolean; newUsedBytes: number }> {
    if (incomingBytes <= 0) {
      return { reserved: true, newUsedBytes: 0 };
    }

    const incomingBigInt = BigInt(incomingBytes);

    return await prisma.$transaction(async (tx) => {
      // 1. Acquire exclusive write lock on User row
      const users = await tx.$queryRaw<Array<{ id: string; quota_bytes: bigint; used_bytes: bigint }>>`
        SELECT id, quota_bytes, used_bytes 
        FROM "User" 
        WHERE id = ${userId} 
        FOR UPDATE
      `;

      if (!users || users.length === 0) {
        throw new Error('User record not found during quota reservation.');
      }

      const user = users[0];
      const maxQuota = BigInt(user.quota_bytes);
      const currentUsed = BigInt(user.used_bytes);
      const remaining = maxQuota - currentUsed;

      // 2. Strict capacity check
      if (currentUsed + incomingBigInt > maxQuota) {
        const remainingMb = (Number(remaining) / (1024 * 1024)).toFixed(1);
        const attemptedMb = (incomingBytes / (1024 * 1024)).toFixed(1);
        throw new QuotaExceededError(
          `Upload exceeds your remaining quota. You have ${remainingMb} MB remaining, but attempted to upload ${attemptedMb} MB.`,
          Number(remaining),
          incomingBytes
        );
      }

      // 3. Atomically update used_bytes to hold the reservation during upload
      const newUsed = currentUsed + incomingBigInt;
      await tx.$executeRaw`
        UPDATE "User" 
        SET used_bytes = ${newUsed}, updated_at = NOW() 
        WHERE id = ${userId}
      `;

      return {
        reserved: true,
        newUsedBytes: Number(newUsed),
      };
    });
  }

  /**
   * Releases previously reserved bytes (e.g. if the upload fails or gets rejected in quarantine)
   */
  public static async releaseQuota(
    userId: string,
    releasedBytes: number | bigint,
    tx?: any
  ): Promise<void> {
    if (releasedBytes <= 0) return;

    const releasedBigInt = BigInt(releasedBytes);

    const executeUpdate = async (client: any) => {
      await client.$executeRaw`
        UPDATE "User" 
        SET used_bytes = CASE 
          WHEN used_bytes >= ${releasedBigInt} THEN used_bytes - ${releasedBigInt}
          ELSE 0 
        END,
        updated_at = NOW()
        WHERE id = ${userId}
      `;
    };

    if (tx) {
      await executeUpdate(tx);
    } else {
      await prisma.$transaction(async (innerTx) => {
        await executeUpdate(innerTx);
      });
    }
  }

  /**
   * Fetches the current user's live storage quota telemetry
   */
  public static async getQuotaStatus(userId: string): Promise<{
    usedBytes: number;
    quotaBytes: number;
    remainingBytes: number;
    percentage: number;
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { used_bytes: true, quota_bytes: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const used = Number(user.used_bytes);
    const quota = Number(user.quota_bytes);
    const remaining = Math.max(0, quota - used);
    const percentage = Math.min(100, Math.round((used / quota) * 100));

    return {
      usedBytes: used,
      quotaBytes: quota,
      remainingBytes: remaining,
      percentage,
    };
  }
}

export default QuotaService;
