import prisma from '../db/prisma.js';
import AnalyticsService from './analytics.service.js';

export class AdminService {
  /**
   * System overview metrics for admin dashboard
   */
  public static async getSystemOverview() {
    return await AnalyticsService.getGlobalPoolAnalytics();
  }

  /**
   * Lists all university users with their quota utilization
   */
  public static async getUsers(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          role: true,
          quota_bytes: true,
          used_bytes: true,
          created_at: true,
          _count: {
            select: { files: { where: { deleted_at: null } } },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.user.count(),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        quotaBytes: u.quota_bytes.toString(),
        usedBytes: u.used_bytes.toString(),
        usagePercentage: Math.min(100, Math.round((Number(u.used_bytes) / Number(u.quota_bytes)) * 100)),
        activeFileCount: u._count.files,
        createdAt: u.created_at,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Adjusts storage quota for a specific university student
   */
  public static async updateUserQuota(targetUserId: string, newQuotaBytes: bigint, adminUserId: string, clientIp = '127.0.0.1') {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      const err = new Error('Target user not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    if (newQuotaBytes < targetUser.used_bytes) {
      const err = new Error(
        `New quota (${(Number(newQuotaBytes) / 1048576).toFixed(1)} MB) cannot be less than student's currently used storage (${(Number(targetUser.used_bytes) / 1048576).toFixed(1)} MB).`
      );
      (err as any).statusCode = 400;
      throw err;
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { quota_bytes: newQuotaBytes },
    });

    // Record administrative action in audit trail
    await prisma.auditLog.create({
      data: {
        user_id: adminUserId,
        action: 'ADMIN_QUOTA_OVERRIDE',
        resource_id: targetUserId,
        ip_address: clientIp,
        details: {
          targetEmail: targetUser.email,
          previousQuotaBytes: targetUser.quota_bytes.toString(),
          newQuotaBytes: newQuotaBytes.toString(),
        },
      },
    });

    return {
      id: updated.id,
      email: updated.email,
      quotaBytes: updated.quota_bytes.toString(),
      usedBytes: updated.used_bytes.toString(),
    };
  }

  /**
   * Lists security quarantine interception incidents
   */
  public static async getQuarantineLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.quarantineLog.findMany({
        include: {
          user: {
            select: { id: true, email: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.quarantineLog.count(),
    ]);

    return {
      incidents: logs.map((log) => ({
        id: log.id,
        userEmail: log.user?.email || 'Anonymous / Unregistered',
        originalName: log.original_name,
        sizeBytes: log.size_bytes.toString(),
        violationReason: log.violation_reason,
        ipAddress: log.ip_address || 'Unknown',
        resolved: log.resolved,
        createdAt: log.created_at,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Marks a quarantined security incident as resolved/reviewed
   */
  public static async resolveQuarantineIncident(incidentId: string, adminUserId: string, clientIp = '127.0.0.1') {
    const incident = await prisma.quarantineLog.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      const err = new Error('Quarantine incident record not found.');
      (err as any).statusCode = 404;
      throw err;
    }

    const updated = await prisma.quarantineLog.update({
      where: { id: incidentId },
      data: { resolved: true },
    });

    await prisma.auditLog.create({
      data: {
        user_id: adminUserId,
        action: 'QUARANTINE_RESOLVE',
        resource_id: incidentId,
        ip_address: clientIp,
        details: {
          originalName: incident.original_name,
          violationReason: incident.violation_reason,
        },
      },
    });

    return updated;
  }

  /**
   * Retrieves audit logs with optional action filtering
   */
  public static async getAuditLogs(page = 1, limit = 100, actionFilter?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (actionFilter && actionFilter.trim().length > 0) {
      where.action = actionFilter.trim();
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { email: true },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs: logs.map((l) => ({
        id: l.id,
        userEmail: l.user?.email || 'System / Unauthenticated',
        action: l.action,
        resourceId: l.resource_id,
        ipAddress: l.ip_address,
        details: l.details,
        createdAt: l.created_at,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Generates a CSV export of the full audit trail for viva presentation / compliance
   */
  public static async exportAuditCsv(): Promise<string> {
    const logs = await prisma.auditLog.findMany({
      include: {
        user: { select: { email: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 1000,
    });

    const headers = ['ID', 'Timestamp', 'UserEmail', 'Action', 'ResourceId', 'IPAddress', 'Details'];
    const rows = logs.map((l) => {
      const email = l.user?.email || 'System';
      const action = l.action;
      const resourceId = l.resource_id || '';
      const ip = l.ip_address || '';
      const details = l.details ? JSON.stringify(l.details).replace(/"/g, '""') : '';
      return `"${l.id}","${l.created_at.toISOString()}","${email}","${action}","${resourceId}","${ip}","${details}"`;
    });

    return [headers.join(','), ...rows].join('\n');
  }
}

export default AdminService;
