import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Trash2,
  RotateCcw,
  Folder as FolderIcon,
  File,
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  Clock,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';

interface TrashedItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  sizeBytes?: string;
  mimeType?: string;
  deletedAt: string;
  expiresAt: string;
  daysRemaining: number;
}

interface RecycleBinProps {
  showToast: (msg: string, type?: 'SUCCESS' | 'ERROR') => void;
  onItemRestored?: () => void;
}

export const RecycleBin: React.FC<RecycleBinProps> = ({ showToast, onItemRestored }) => {
  const [items, setItems] = useState<TrashedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  useEffect(() => {
    loadTrash();
  }, []);

  const loadTrash = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/v1/trash');
      const files: TrashedItem[] = res.data.data.files || [];
      const folders: TrashedItem[] = res.data.data.folders || [];
      setItems([...folders, ...files]);
    } catch {
      showToast('Failed to load Recycle Bin items.', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (item: TrashedItem) => {
    setActionInProgress(item.id);
    try {
      if (item.type === 'file') {
        await axios.post(`/api/v1/trash/files/${item.id}/restore`);
      } else {
        await axios.post(`/api/v1/trash/folders/${item.id}/restore`);
      }
      showToast(`"${item.name}" restored successfully!`);
      loadTrash();
      if (onItemRestored) onItemRestored();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to restore item.';
      showToast(msg, 'ERROR');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeletePermanently = async (item: TrashedItem) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${item.name}"? This action cannot be undone and ciphertext will be erased immediately.`
      )
    ) {
      return;
    }

    setActionInProgress(item.id);
    try {
      if (item.type === 'file') {
        await axios.delete(`/api/v1/trash/files/${item.id}`);
      } else {
        await axios.delete(`/api/v1/trash/folders/${item.id}`);
      }
      showToast(`"${item.name}" permanently deleted.`);
      loadTrash();
      if (onItemRestored) onItemRestored();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to permanently delete item.';
      showToast(msg, 'ERROR');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleEmptyTrash = async () => {
    if (
      !window.confirm(
        'Are you sure you want to empty the Recycle Bin? All soft-deleted items will be wiped from disk permanently and your quota will be reclaimed.'
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await axios.delete('/api/v1/trash/empty');
      showToast(`Recycle Bin emptied (${res.data.data.filesPurged} files purged).`);
      loadTrash();
      if (onItemRestored) onItemRestored();
    } catch {
      showToast('Failed to empty Recycle Bin.', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes?: string) => {
    if (!bytes) return '-';
    const num = parseInt(bytes, 10);
    if (isNaN(num) || num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return `${parseFloat((num / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getItemIcon = (item: TrashedItem) => {
    if (item.type === 'folder') return <FolderIcon className="w-5 h-5 text-amber-500 fill-amber-500/20" />;
    const ext = item.name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-5 h-5 text-emerald-500" />;
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext || '')) return <FileArchive className="w-5 h-5 text-amber-500" />;
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json'].includes(ext || '')) return <FileCode className="w-5 h-5 text-indigo-500" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) return <FileText className="w-5 h-5 text-sky-500" />;
    return <File className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Recycle Bin
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300 font-normal">
                {items.length} items
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Items are kept for 30 days before permanent auto-purge. Quota is reclaimed upon permanent deletion.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTrash}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
            title="Refresh Trash"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleEmptyTrash}
            disabled={items.length === 0 || loading}
            className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
          >
            <ShieldAlert className="w-4 h-4" /> Empty Recycle Bin
          </button>
        </div>
      </div>

      {/* Main Table */}
      {loading && items.length === 0 ? (
        <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-sky-500" /> Loading Recycle Bin...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-navy-900 rounded-2xl p-12 border border-dashed border-slate-300 dark:border-slate-800 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-navy-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Trash2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Recycle Bin is empty</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Deleted files and folders will appear here for 30 days before permanent automatic purging.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-navy-800/60 text-slate-500 text-xs uppercase border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Deleted Date</th>
                <th className="py-3 px-4">Auto-Purge In</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const isUrgent = item.daysRemaining <= 3;
                const isWarning = item.daysRemaining <= 7 && !isUrgent;

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/30">
                    <td className="py-3 px-4 flex items-center gap-2.5">
                      {getItemIcon(item)}
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs">
                        {item.name}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">{formatBytes(item.sizeBytes)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {new Date(item.deletedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          isUrgent
                            ? 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 animate-pulse'
                            : isWarning
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                            : 'bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {item.daysRemaining} {item.daysRemaining === 1 ? 'day' : 'days'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleRestore(item)}
                          disabled={actionInProgress === item.id}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-navy-800 text-slate-700 dark:text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
                          title="Restore to active filesystem"
                        >
                          <RotateCcw className="w-3 h-3 text-sky-500" /> Restore
                        </button>
                        <button
                          onClick={() => handleDeletePermanently(item)}
                          disabled={actionInProgress === item.id}
                          className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium flex items-center gap-1 transition-colors"
                          title="Delete permanently from vault"
                        >
                          <Trash2 className="w-3 h-3" /> Purge
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RecycleBin;
