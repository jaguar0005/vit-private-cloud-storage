import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Share2,
  Copy,
  Check,
  Lock,
  Download,
  Eye,
  Trash2,
  Clock,
  ShieldCheck,
} from 'lucide-react';

interface ShareModalProps {
  file: { id: string; name: string } | null;
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, type?: 'SUCCESS' | 'ERROR') => void;
}

interface ShareItem {
  id: string;
  token: string;
  is_active: boolean;
  expires_at: string | null;
  max_downloads: number | null;
  download_count: number;
  permission: 'VIEW_ONLY' | 'DOWNLOAD';
  password_hash: string | null;
  created_at: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ file, isOpen, onClose, showToast }) => {
  const [shares, setShares] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form states
  const [expiryOption, setExpiryOption] = useState<'1h' | '24h' | '7d' | '30d' | 'never'>('24h');
  const [enablePassword, setEnablePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [enableMaxDownloads, setEnableMaxDownloads] = useState(false);
  const [maxDownloads, setMaxDownloads] = useState(5);
  const [permission, setPermission] = useState<'DOWNLOAD' | 'VIEW_ONLY'>('DOWNLOAD');

  // Recently created share link for quick copy
  const [recentLink, setRecentLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      loadShares();
      setRecentLink(null);
      setCopied(false);
      setPassword('');
      setEnablePassword(false);
      setEnableMaxDownloads(false);
    }
  }, [isOpen, file]);

  const loadShares = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/v1/shares/file/${file.id}`);
      setShares(res.data.data || []);
    } catch {
      showToast('Failed to load existing share links.', 'ERROR');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    let expiresAt: string | null = null;
    const now = Date.now();
    if (expiryOption === '1h') expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
    else if (expiryOption === '24h') expiresAt = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    else if (expiryOption === '7d') expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    else if (expiryOption === '30d') expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

    setCreating(true);
    try {
      const res = await axios.post('/api/v1/shares', {
        fileId: file.id,
        expiresAt,
        password: enablePassword && password.trim() ? password.trim() : undefined,
        maxDownloads: enableMaxDownloads ? maxDownloads : null,
        permission,
      });

      const fullUrl = res.data.data.shareUrl || `${window.location.origin}/share/${res.data.data.token}`;
      setRecentLink(fullUrl);
      showToast('Secure share link created successfully!');
      loadShares();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || 'Failed to generate share link.';
      showToast(msg, 'ERROR');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await axios.delete(`/api/v1/shares/${shareId}`);
      showToast('Share link revoked.');
      loadShares();
    } catch {
      showToast('Failed to revoke share link.', 'ERROR');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast('Share link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Share Securely</h3>
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Copy Box when recently generated */}
          {recentLink && (
            <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> Share Link Ready
                </p>
                <p className="text-xs text-emerald-950 dark:text-emerald-200/90 font-mono truncate select-all">
                  {recentLink}
                </p>
              </div>
              <button
                onClick={() => copyToClipboard(recentLink)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex items-center gap-1.5 shrink-0 shadow-sm"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {/* Create Link Configuration Form */}
          <form onSubmit={handleCreateShare} className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Configure Access Policies</h4>

            {/* Permission Option */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">
                Access Permission
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPermission('DOWNLOAD')}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                    permission === 'DOWNLOAD'
                      ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-navy-800'
                  }`}
                >
                  <Download className="w-4 h-4 text-sky-500" /> Full Download
                </button>
                <button
                  type="button"
                  onClick={() => setPermission('VIEW_ONLY')}
                  className={`p-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                    permission === 'VIEW_ONLY'
                      ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-500'
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-navy-800'
                  }`}
                >
                  <Eye className="w-4 h-4 text-indigo-500" /> View Only (Preview)
                </button>
              </div>
            </div>

            {/* Expiration Selection */}
            <div>
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5 block flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Link Expiration
              </label>
              <select
                value={expiryOption}
                onChange={(e) => setExpiryOption(e.target.value as any)}
                className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-navy-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
              >
                <option value="1h">Expires in 1 Hour</option>
                <option value="24h">Expires in 24 Hours (Default)</option>
                <option value="7d">Expires in 7 Days</option>
                <option value="30d">Expires in 30 Days</option>
                <option value="never">No Expiration</option>
              </select>
            </div>

            {/* Optional Password Protection */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-amber-500" /> Password Protection
                </span>
                <input
                  type="checkbox"
                  checked={enablePassword}
                  onChange={(e) => setEnablePassword(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
              </label>
              {enablePassword && (
                <input
                  type="password"
                  placeholder="Enter secret passcode for access"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-900 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              )}
            </div>

            {/* Optional Max Downloads Cap */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Download className="w-3.5 h-3.5 text-sky-500" /> Download Limit Cap
                </span>
                <input
                  type="checkbox"
                  checked={enableMaxDownloads}
                  onChange={(e) => setEnableMaxDownloads(e.target.checked)}
                  className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                />
              </label>
              {enableMaxDownloads && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={maxDownloads}
                    onChange={(e) => setMaxDownloads(parseInt(e.target.value, 10) || 1)}
                    className="w-24 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-navy-900 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-xs text-slate-500">max download(s) allowed</span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs shadow-md shadow-sky-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              <Share2 className="w-4 h-4" />
              {creating ? 'Generating Secure Link...' : 'Create Share Link'}
            </button>
          </form>

          {/* Existing Links List */}
          <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Active Links ({shares.filter((s) => s.is_active).length})
            </h4>

            {loading ? (
              <p className="text-xs text-slate-400 text-center py-4">Loading active links...</p>
            ) : shares.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No active share links for this file yet.</p>
            ) : (
              <div className="space-y-2">
                {shares.map((s) => {
                  const shareUrl = `${window.location.origin}/share/${s.token}`;
                  return (
                    <div
                      key={s.id}
                      className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs ${
                        s.is_active
                          ? 'bg-slate-50/70 dark:bg-navy-800/40 border-slate-200 dark:border-slate-800'
                          : 'bg-slate-100/40 dark:bg-navy-950/40 border-slate-200/50 dark:border-slate-800/50 opacity-60'
                      }`}
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                              s.is_active
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {s.is_active ? 'Active' : 'Disabled'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[10px]">
                            {s.permission === 'VIEW_ONLY' ? 'View Only' : 'Download'}
                          </span>
                          {s.password_hash && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" /> Password
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500">
                            Downloads: {s.download_count}
                            {s.max_downloads !== null ? ` / ${s.max_downloads}` : ''}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate">{shareUrl}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.is_active && (
                          <button
                            onClick={() => copyToClipboard(shareUrl)}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-sky-600 rounded-lg hover:bg-slate-200 dark:hover:bg-navy-700 transition-colors"
                            title="Copy Link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {s.is_active && (
                          <button
                            onClick={() => handleRevoke(s.id)}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Revoke Link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
