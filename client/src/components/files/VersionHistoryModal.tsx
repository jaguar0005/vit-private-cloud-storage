import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  History,
  Download,
  RotateCcw,
  CheckCircle2,
  Clock,
  Copy,
  Check,
} from 'lucide-react';

interface VersionHistoryModalProps {
  file: { id: string; name: string } | null;
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: 'SUCCESS' | 'ERROR') => void;
  onReverted?: () => void;
}

interface HistoricalVersion {
  id: string;
  version_number: number;
  size_bytes: string;
  sha256_hash: string;
  created_at: string;
}

interface ActiveFileInfo {
  id: string;
  name: string;
  size_bytes: string;
  mime_type: string;
  updated_at: string;
  sha256_hash: string;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  file,
  isOpen,
  onClose,
  showToast,
  onReverted,
}) => {
  const [loading, setLoading] = useState(false);
  const [activeFile, setActiveFile] = useState<ActiveFileInfo | null>(null);
  const [versions, setVersions] = useState<HistoricalVersion[]>([]);
  const [revertingId, setRevertingId] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      loadVersions();
    }
  }, [isOpen, file]);

  const loadVersions = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/files/${file.id}/versions`);
      setActiveFile(res.data.data.activeFile);
      setVersions(res.data.data.versions || []);
    } catch {
      showToast('Failed to load version history.', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: string | number) => {
    const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
    if (num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return `${parseFloat((num / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const handleDownloadVersion = async (versionId: string, versionNumber: number) => {
    if (!file) return;
    try {
      const res = await axios.get(`/api/v1/files/${file.id}/versions/${versionId}/download`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `v${versionNumber}_${file.name}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      showToast('Failed to download historical version.', 'ERROR');
    }
  };

  const handleRevert = async (versionId: string, versionNumber: number) => {
    if (!file) return;
    if (
      !window.confirm(
        `Are you sure you want to revert "${file.name}" to Version ${versionNumber}? The current active file will be archived as a version.`
      )
    ) {
      return;
    }

    setRevertingId(versionId);
    try {
      await axios.post(`/api/v1/files/${file.id}/versions/${versionId}/revert`);
      showToast(`Successfully reverted to Version ${versionNumber}!`);
      await loadVersions();
      if (onReverted) onReverted();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to revert version.';
      showToast(msg, 'ERROR');
    } finally {
      setRevertingId(null);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Version History</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-sm">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Policy Notice */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-navy-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <Clock className="w-4 h-4 text-sky-500 shrink-0" />
            <span>
              Retains up to <strong>5 versions</strong>. Overwriting the file saves your current copy into history and
              safely prunes older revisions.
            </span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading versions...</div>
          ) : (
            <div className="space-y-4">
              {/* Active Current Version */}
              {activeFile && (
                <div className="p-4 rounded-xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-600 text-white flex items-center gap-1.5 shadow-sm">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Current Active
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                      {formatBytes(activeFile.size_bytes)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between pt-1">
                    <span>Last modified: {new Date(activeFile.updated_at).toLocaleString()}</span>
                    <button
                      onClick={() => copyHash(activeFile.sha256_hash)}
                      className="text-[11px] font-mono text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                      title="Copy SHA-256 Checksum"
                    >
                      {activeFile.sha256_hash.substring(0, 10)}...
                      {copiedHash === activeFile.sha256_hash ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Historical Versions List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Historical Revisions ({versions.length})
                </h4>

                {versions.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No prior versions. Overwrite this file by uploading a file with the exact same name to create a
                    revision.
                  </p>
                ) : (
                  versions.map((v) => (
                    <div
                      key={v.id}
                      className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-navy-900 flex items-center justify-between gap-3 text-xs shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-navy-800 text-slate-700 dark:text-slate-300 font-semibold text-xs">
                            Version {v.version_number}
                          </span>
                          <span className="text-slate-500">{formatBytes(v.size_bytes)}</span>
                        </div>
                        <p className="text-slate-400 text-[11px]">{new Date(v.created_at).toLocaleString()}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleDownloadVersion(v.id, v.version_number)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-navy-800 text-slate-600 dark:text-slate-300 flex items-center gap-1.5 text-xs font-medium transition-colors"
                          title="Download Historical Version"
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                        <button
                          onClick={() => handleRevert(v.id, v.version_number)}
                          disabled={revertingId === v.id}
                          className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                          title="Revert to this version"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {revertingId === v.id ? 'Reverting...' : 'Revert'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryModal;
