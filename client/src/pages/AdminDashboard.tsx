import React, { useState } from 'react';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ShieldAlert,
  Users,
  HardDrive,
  Activity,
  FileCheck2,
  AlertTriangle,
  Download,
  Filter,
  CheckCircle,
  ArrowLeft,
  RefreshCw,
  Search,
  Sliders,
  Check,
  X,
  UserCheck,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface GlobalStats {
  pool: {
    capacityBytes: string;
    usedBytes: string;
    freeBytes: string;
    utilizationPercent: number;
    dedicatedPoolLimitGb: number;
  };
  tenants: {
    totalRegistered: number;
    totalFiles: number;
    totalHistoricalVersions: number;
  };
  security: {
    totalQuarantined: number;
    unresolvedThreats: number;
  };
}

interface StudentUser {
  id: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
  quota_bytes: string;
  used_bytes: string;
  created_at: string;
  _count: {
    files: number;
    folders: number;
  };
}

interface QuarantineItem {
  id: string;
  filename: string;
  threat_type: string;
  user_email: string;
  client_ip: string;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
}

interface AuditLogItem {
  id: string;
  user_id: string;
  action: string;
  resource_id: string | null;
  ip_address: string;
  user_agent: string | null;
  metadata: any;
  created_at: string;
  user: {
    email: string;
  };
}

export const AdminDashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'USERS' | 'QUARANTINE' | 'AUDIT'>('USERS');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedUserForQuota, setSelectedUserForQuota] = useState<StudentUser | null>(null);
  const [customQuotaMb, setCustomQuotaMb] = useState<string>('200');
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'SUCCESS' | 'ERROR' } | null>(null);

  const showToast = (message: string, type: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const formatBytes = (bytesStr: string | number) => {
    const bytes = typeof bytesStr === 'string' ? Number(bytesStr) : bytesStr;
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  // 1. Fetch Global Pool Stats
  const { data: statsData, refetch: refetchStats } = useQuery<{ success: boolean; data: GlobalStats }>({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/admin/stats');
      return res.data;
    },
    refetchInterval: 30000,
  });

  // 2. Fetch Users
  const { data: usersData, isLoading: usersLoading } = useQuery<{ success: boolean; data: { users: StudentUser[]; total: number } }>({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/admin/users?limit=100');
      return res.data;
    },
    enabled: activeTab === 'USERS',
  });

  // 3. Fetch Quarantine
  const { data: quarantineData, isLoading: quarantineLoading } = useQuery<{ success: boolean; data: { logs: QuarantineItem[]; total: number } }>({
    queryKey: ['adminQuarantine'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/admin/quarantine?limit=100');
      return res.data;
    },
    enabled: activeTab === 'QUARANTINE',
  });

  // 4. Fetch Audit Logs
  const { data: auditData, isLoading: auditLoading } = useQuery<{ success: boolean; data: { logs: AuditLogItem[]; total: number } }>({
    queryKey: ['adminAudit', auditActionFilter],
    queryFn: async () => {
      const url = auditActionFilter
        ? `/api/v1/admin/audit?limit=100&action=${auditActionFilter}`
        : '/api/v1/admin/audit?limit=100';
      const res = await axios.get(url);
      return res.data;
    },
    enabled: activeTab === 'AUDIT',
  });

  // Update Quota Mutation
  const updateQuotaMutation = useMutation({
    mutationFn: async ({ userId, quotaMb }: { userId: string; quotaMb: number }) => {
      const res = await axios.patch(`/api/v1/admin/users/${userId}/quota`, { quotaMb });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      setSelectedUserForQuota(null);
      showToast('Student storage quota updated successfully.');
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        showToast(err.response.data.error.message, 'ERROR');
      } else {
        showToast('Failed to update student quota.', 'ERROR');
      }
    },
  });

  // Resolve Quarantine Incident Mutation
  const resolveThreatMutation = useMutation({
    mutationFn: async (logId: string) => {
      const res = await axios.patch(`/api/v1/admin/quarantine/${logId}/resolve`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminQuarantine'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      showToast('Threat incident resolved.');
    },
    onError: () => {
      showToast('Failed to resolve threat.', 'ERROR');
    },
  });

  // Export Audit CSV
  const handleExportCsv = async () => {
    try {
      const res = await axios.get('/api/v1/admin/audit/export', { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `vit_cloud_audit_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      showToast('Audit log CSV exported successfully.');
    } catch {
      showToast('Failed to export audit log CSV.', 'ERROR');
    }
  };

  const stats = statsData?.data;
  const filteredUsers = (usersData?.data.users || []).filter((u) =>
    u.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-xl border flex items-center gap-3 transition-all ${
            toast.type === 'SUCCESS'
              ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          {toast.type === 'SUCCESS' ? <Check className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-red-600" />}
          <span className="text-xs font-semibold">{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-white dark:bg-navy-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-navy-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Vault</span>
          </Link>
          <div className="border-l border-slate-200 dark:border-slate-800 h-6" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight">VIT Institutional Governance Console</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                ADMIN RBAC
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              20 GB Single-Host Dedicated Pool &bull; Tenant Isolation &bull; Security Defense Log
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          <button
            onClick={() => refetchStats()}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
            title="Refresh System Metrics"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold">{user?.email}</p>
            <span className="text-[10px] text-slate-400">Root Administrator</span>
          </div>
          <button
            onClick={() => logout()}
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
        {/* Metric Cards Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: 20 GB Pool Utilization */}
          <div className="bg-white dark:bg-navy-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Host Pool Pool</span>
              <HardDrive className="w-5 h-5 text-sky-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats ? formatBytes(stats.pool.usedBytes) : '...'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                of {stats ? `${stats.pool.dedicatedPoolLimitGb} GB` : '20 GB'} ({stats?.pool.utilizationPercent || 0}%)
              </p>
            </div>
            <div className="w-full bg-slate-100 dark:bg-navy-800 h-2 rounded-full overflow-hidden mt-3">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.max(stats?.pool.utilizationPercent || 0, 2)}%` }}
              />
            </div>
          </div>

          {/* Card 2: Registered Tenants */}
          <div className="bg-white dark:bg-navy-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Students</span>
              <Users className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats ? stats.tenants.totalRegistered : '...'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">@vit.edu institutional accounts</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-3">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Multi-tenant row-locked</span>
            </div>
          </div>

          {/* Card 3: Vault Objects & Snapshots */}
          <div className="bg-white dark:bg-navy-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vault Files & Diffs</span>
              <FileCheck2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {stats ? stats.tenants.totalFiles : '...'}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                +{stats ? stats.tenants.totalHistoricalVersions : '0'} historical versions
              </p>
            </div>
            <div className="text-[11px] text-slate-400 mt-3 font-mono">
              AES-256-GCM Envelope Active
            </div>
          </div>

          {/* Card 4: Intercepted Threats */}
          <div className="bg-white dark:bg-navy-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quarantine Alerts</span>
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                  {stats ? stats.security.totalQuarantined : '...'}
                </span>
                {(stats?.security.unresolvedThreats || 0) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-950 text-red-600">
                    {stats?.security.unresolvedThreats} Unresolved
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">9-Stage upload pipeline defenses</p>
            </div>
            <div className="text-xs text-red-600 dark:text-red-400 font-medium mt-3 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Zero-trust staging</span>
            </div>
          </div>
        </div>

        {/* Console Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-2">
          <button
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'USERS'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                : 'bg-white dark:bg-navy-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Student Roster & Quota Overrides</span>
          </button>

          <button
            onClick={() => setActiveTab('QUARANTINE')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
              activeTab === 'QUARANTINE'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/20'
                : 'bg-white dark:bg-navy-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Quarantine Threat Console</span>
            {(stats?.security.unresolvedThreats || 0) > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse ml-1" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('AUDIT')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'AUDIT'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                : 'bg-white dark:bg-navy-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>Institutional Audit Trail</span>
          </button>
        </div>

        {/* TAB 1: Student Roster & Quota Overrides */}
        {activeTab === 'USERS' && (
          <div className="bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-80">
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    placeholder="Search students by @vit.edu email..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-navy-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
              <span className="text-xs text-slate-400">
                Showing {filteredUsers.length} enrolled student accounts
              </span>
            </div>

            {usersLoading ? (
              <div className="py-20 flex justify-center items-center">
                <RefreshCw className="w-6 h-6 text-sky-500 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-navy-800/60 text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Student Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Storage Consumption</th>
                      <th className="py-3 px-4">Allocation Quota</th>
                      <th className="py-3 px-4">Files / Folders</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredUsers.map((u) => {
                      const usedNum = Number(u.used_bytes);
                      const quotaNum = Number(u.quota_bytes);
                      const pct = quotaNum > 0 ? Math.min(100, Math.round((usedNum / quotaNum) * 100)) : 0;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/30">
                          <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-100">
                            {u.email}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                u.role === 'ADMIN'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                              }`}
                            >
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <div>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {formatBytes(u.used_bytes)}
                              </span>
                              <span className="text-slate-400 ml-1">({pct}%)</span>
                            </div>
                            <div className="w-24 bg-slate-100 dark:bg-navy-800 h-1.5 rounded-full overflow-hidden mt-1">
                              <div
                                className={`h-full rounded-full ${
                                  pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-sky-500'
                                }`}
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                            {formatBytes(u.quota_bytes)}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500">
                            {u._count.files} files &bull; {u._count.folders} folders
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedUserForQuota(u);
                                setCustomQuotaMb(Math.round(Number(u.quota_bytes) / (1024 * 1024)).toString());
                              }}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-navy-800 text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5 ml-auto transition-colors"
                            >
                              <Sliders className="w-3.5 h-3.5" />
                              <span>Adjust Quota</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Security & Quarantine Incident Console */}
        {activeTab === 'QUARANTINE' && (
          <div className="bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span>Quarantine Isolation Vault & Threat Logs</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Untrusted files blocked before reaching the encrypted storage vault
                </p>
              </div>
              <span className="text-xs text-slate-400">
                {quarantineData?.data.total || 0} Total Interceptions
              </span>
            </div>

            {quarantineLoading ? (
              <div className="py-20 flex justify-center items-center">
                <RefreshCw className="w-6 h-6 text-red-500 animate-spin" />
              </div>
            ) : !quarantineData?.data.logs || quarantineData.data.logs.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">No Quarantine Incidents</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  All uploaded files have passed Stage 1-8 checks: ClamAV virus scanning, archive compression safety, and magic byte validation.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-navy-800/60 text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Threat Detection</th>
                      <th className="py-3 px-4">Offending File</th>
                      <th className="py-3 px-4">Uploader Email</th>
                      <th className="py-3 px-4">Source IP</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Governance Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {quarantineData.data.logs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/30">
                        <td className="py-3.5 px-4 font-bold text-red-600 dark:text-red-400">
                          {item.threat_type}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-200">
                          {item.filename}
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                          {item.user_email}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {item.client_ip}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(item.created_at).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4">
                          {item.resolved ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1 w-fit">
                              <Check className="w-3 h-3" /> Resolved
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-3 h-3" /> Active Flag
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {!item.resolved && (
                            <button
                              onClick={() => resolveThreatMutation.mutate(item.id)}
                              disabled={resolveThreatMutation.isPending}
                              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-sm transition-all inline-flex items-center gap-1.5"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Resolve Threat</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Institutional Audit Trail */}
        {activeTab === 'AUDIT' && (
          <div className="bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400" />
                  <select
                    value={auditActionFilter}
                    onChange={(e) => setAuditActionFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-navy-800 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">All Security Events</option>
                    <option value="AUTH_LOGIN">AUTH_LOGIN</option>
                    <option value="AUTH_LOGOUT">AUTH_LOGOUT</option>
                    <option value="FILE_UPLOAD">FILE_UPLOAD</option>
                    <option value="FILE_DOWNLOAD">FILE_DOWNLOAD</option>
                    <option value="FILE_DELETE">FILE_DELETE</option>
                    <option value="FILE_REVERT">FILE_REVERT</option>
                    <option value="SHARE_CREATE">SHARE_CREATE</option>
                    <option value="SHARE_DOWNLOAD">SHARE_DOWNLOAD</option>
                    <option value="QUOTA_OVERRIDE">QUOTA_OVERRIDE</option>
                    <option value="QUARANTINE_RESOLVE">QUARANTINE_RESOLVE</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCsv}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV Log</span>
                </button>
              </div>
            </div>

            {auditLoading ? (
              <div className="py-20 flex justify-center items-center">
                <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-navy-800/60 text-slate-500 uppercase border-b border-slate-200 dark:border-slate-800 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Event Action</th>
                      <th className="py-3 px-4">Actor Email</th>
                      <th className="py-3 px-4">IP Address</th>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Event Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(auditData?.data.logs || []).map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/30">
                        <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                          {log.action}
                        </td>
                        <td className="py-3.5 px-4 font-medium text-slate-800 dark:text-slate-100">
                          {log.user?.email || 'System'}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">
                          {log.ip_address}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="py-3.5 px-4 max-w-xs truncate text-slate-500 font-mono text-[11px]" title={JSON.stringify(log.metadata)}>
                          {JSON.stringify(log.metadata)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Quota Adjustment Modal */}
      {selectedUserForQuota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 dark:text-sky-400">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                    Adjust Personal Quota
                  </h3>
                  <p className="text-xs text-slate-400 truncate max-w-[260px]">
                    {selectedUserForQuota.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedUserForQuota(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Storage Info */}
            <div className="bg-slate-50 dark:bg-navy-800/50 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">Current Storage Consumed:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatBytes(selectedUserForQuota.used_bytes)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Current Allocation Cap:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {formatBytes(selectedUserForQuota.quota_bytes)}
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Institutional Allocation Presets:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Standard', mb: '200' },
                  { label: 'Thesis Grant', mb: '500' },
                  { label: 'Capstone Pool', mb: '1024' },
                ].map((preset) => (
                  <button
                    key={preset.mb}
                    type="button"
                    onClick={() => setCustomQuotaMb(preset.mb)}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      customQuotaMb === preset.mb
                        ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-navy-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <div>{preset.label}</div>
                    <div className="text-[10px] opacity-75">{preset.mb} MB</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Custom Megabytes (MB):
              </label>
              <input
                type="number"
                min="10"
                max="20000"
                value={customQuotaMb}
                onChange={(e) => setCustomQuotaMb(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-navy-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedUserForQuota(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-800"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!customQuotaMb || Number(customQuotaMb) <= 0 || updateQuotaMutation.isPending}
                onClick={() =>
                  updateQuotaMutation.mutate({
                    userId: selectedUserForQuota.id,
                    quotaMb: parseInt(customQuotaMb, 10),
                  })
                }
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
              >
                {updateQuotaMutation.isPending ? 'Applying...' : 'Apply Quota Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
