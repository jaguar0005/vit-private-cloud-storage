import React from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import {
  X,
  PieChart as PieChartIcon,
  BarChart3,
  HardDrive,
  Layers,
  File,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface CategoryBreakdown {
  category: string;
  count: number;
  bytes: string;
}

interface ActivityItem {
  date: string;
  uploads: number;
  downloads: number;
  shares: number;
}

interface AnalyticsData {
  quota: {
    allocatedBytes: string;
    usedBytes: string;
    freeBytes: string;
    usagePercentage: number;
  };
  counts: {
    activeFiles: number;
    folders: number;
    historicalVersions: number;
  };
  versionOverheadBytes: string;
  categoryBreakdown: CategoryBreakdown[];
  recentActivity: ActivityItem[];
}

interface StorageAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  DOCUMENTS: '#0284c7', // Sky-600
  IMAGES: '#10b981',    // Emerald-500
  MEDIA: '#6366f1',     // Indigo-500
  ARCHIVES: '#f59e0b',  // Amber-500
  CODE: '#d946ef',      // Fuchsia-500
  OTHER: '#64748b',     // Slate-500
};

export const StorageAnalyticsModal: React.FC<StorageAnalyticsModalProps> = ({ isOpen, onClose }) => {
  const { data, isLoading, refetch, isFetching } = useQuery<AnalyticsData>({
    queryKey: ['userAnalytics'],
    queryFn: async () => {
      const res = await axios.get('/api/v1/analytics/me');
      return res.data.data;
    },
    enabled: isOpen,
  });

  if (!isOpen) return null;

  const formatBytes = (bytesStr: string | number) => {
    const bytes = typeof bytesStr === 'string' ? Number(bytesStr) : bytesStr;
    if (isNaN(bytes) || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const chartData = (data?.categoryBreakdown || [])
    .filter((item) => Number(item.bytes) > 0 || item.count > 0)
    .map((item) => ({
      name: item.category,
      value: Math.round(Number(item.bytes) / (1024 * 1024) * 10) / 10, // MB
      count: item.count,
      bytes: item.bytes,
    }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-navy-900">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
              <PieChartIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">
                Personal Storage Telemetry & Analytics
              </h3>
              <p className="text-xs text-slate-400">Real-time breakdown of institutional storage quota and activities</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin text-sky-500' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <RefreshCw className="w-8 h-8 text-sky-500 animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Aggregating storage telemetry...</p>
            </div>
          ) : data ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 dark:bg-navy-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
                    <HardDrive className="w-4 h-4 text-sky-500" />
                    <span>Used / Total</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {formatBytes(data.quota.usedBytes)}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    of {formatBytes(data.quota.allocatedBytes)} ({data.quota.usagePercentage}%)
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-navy-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Free Space</span>
                  </div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                    {formatBytes(data.quota.freeBytes)}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">Available for uploads</p>
                </div>

                <div className="bg-slate-50 dark:bg-navy-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span>Version Snapshots</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {data.counts.historicalVersions}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {formatBytes(data.versionOverheadBytes)} overhead
                  </p>
                </div>

                <div className="bg-slate-50 dark:bg-navy-800/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold mb-1">
                    <File className="w-4 h-4 text-amber-500" />
                    <span>Files & Folders</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {data.counts.activeFiles} files
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    in {data.counts.folders} folders
                  </p>
                </div>
              </div>

              {/* Charts Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Category Pie Chart */}
                <div className="bg-white dark:bg-navy-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <PieChartIcon className="w-4 h-4 text-sky-500" />
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        Category Storage Breakdown
                      </h4>
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Megabytes (MB)</span>
                  </div>

                  {chartData.length === 0 ? (
                    <div className="h-60 flex flex-col items-center justify-center text-center p-4">
                      <HardDrive className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-xs text-slate-400">No active files stored in your vault yet.</p>
                    </div>
                  ) : (
                    <div className="h-60 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={chartData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            paddingAngle={3}
                          >
                            {chartData.map((entry) => (
                              <Cell
                                key={`cell-${entry.name}`}
                                fill={CATEGORY_COLORS[entry.name] || '#64748b'}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: any, name: any) => [`${value} MB`, name]}
                            contentStyle={{
                              borderRadius: '12px',
                              backgroundColor: '#0f172a',
                              borderColor: '#334155',
                              color: '#f8fafc',
                              fontSize: '12px',
                            }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Category Breakdown Table / Badges */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    {data.categoryBreakdown.map((cat) => (
                      <div
                        key={cat.category}
                        className="p-2 rounded-xl bg-slate-50 dark:bg-navy-900 border border-slate-100 dark:border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: CATEGORY_COLORS[cat.category] || '#64748b' }}
                          />
                          <span className="truncate">{cat.category}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 flex justify-between">
                          <span>{cat.count} files</span>
                          <span>{formatBytes(cat.bytes)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 14-Day Activity Bar Chart */}
                <div className="bg-white dark:bg-navy-800/40 p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-emerald-500" />
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        14-Day Activity Velocity
                      </h4>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Audit Trail</span>
                    </div>
                  </div>

                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.recentActivity}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                        <XAxis
                          dataKey="date"
                          tickFormatter={(val) => val.slice(5)} // MM-DD
                          fontSize={10}
                          tickLine={false}
                        />
                        <YAxis allowDecimals={false} fontSize={10} tickLine={false} />
                        <Tooltip
                          contentStyle={{
                            borderRadius: '12px',
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            color: '#f8fafc',
                            fontSize: '12px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="uploads" name="Uploads" fill="#0284c7" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="downloads" name="Downloads" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="shares" name="Shares" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 p-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/50 text-[11px] text-sky-800 dark:text-sky-300">
                    <strong>Audit Verified:</strong> All actions are recorded with cryptographic SHA-256 hashes and client IP addresses in your tamper-evident audit history.
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default StorageAnalyticsModal;
