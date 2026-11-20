import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import {
  Download,
  Lock,
  Clock,
  ShieldCheck,
  File,
  FileText,
  FileArchive,
  FileCode,
  Image as ImageIcon,
  AlertTriangle,
  RefreshCw,
  Eye,
} from 'lucide-react';

interface PublicMeta {
  token: string;
  fileName: string;
  fileSize: string;
  mimeType: string;
  permission: 'VIEW_ONLY' | 'DOWNLOAD';
  isPasswordProtected: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
}

export const PublicShare: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  // Password state
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchShareMeta();
    }
  }, [token]);

  const fetchShareMeta = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/shares/public/${token}`);
      setMeta(res.data.data);
    } catch (err: any) {
      const errData = err.response?.data?.error || {
        code: 'NETWORK_ERROR',
        message: 'Could not connect to VIT Private Cloud.',
      };
      setError(errData);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadOrPreview = async (preview = false) => {
    if (!token || !meta) return;
    setDownloading(true);
    setPasswordError(null);

    try {
      const res = await axios.post(
        `/api/v1/shares/public/${token}/download${preview ? '?preview=true' : ''}`,
        { password: password || undefined },
        { responseType: 'blob' }
      );

      const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: meta.mimeType }));

      if (preview) {
        window.open(blobUrl, '_blank');
      } else {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.setAttribute('download', meta.fileName);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }

      // Update remaining download count if tracked
      setMeta((prev) => (prev ? { ...prev, downloadCount: prev.downloadCount + 1 } : null));
    } catch (err: any) {
      if (err.response?.status === 401) {
        setPasswordError('Incorrect password. Please try again.');
      } else {
        const msg = err.response?.data?.error?.message || 'Failed to download or preview file.';
        setPasswordError(msg);
      }
    } finally {
      setDownloading(false);
    }
  };

  const formatBytes = (bytes?: string) => {
    if (!bytes) return '0 B';
    const num = parseInt(bytes, 10);
    if (isNaN(num) || num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return `${parseFloat((num / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-10 h-10 text-emerald-500" />;
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext || '')) return <FileArchive className="w-10 h-10 text-amber-500" />;
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json'].includes(ext || '')) return <FileCode className="w-10 h-10 text-indigo-500" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) return <FileText className="w-10 h-10 text-sky-500" />;
    return <File className="w-10 h-10 text-slate-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950 flex flex-col justify-between p-4 selection:bg-sky-500 selection:text-white">
      {/* Top Navbar */}
      <header className="max-w-4xl mx-auto w-full py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-sky-600/20">
            VIT
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100">VIT Private Cloud Storage</h1>
            <p className="text-[11px] text-slate-400">Institutional Secure File Sharing</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5" /> AES-256 Envelope Encrypted
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-md mx-auto w-full my-auto">
        {loading ? (
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center shadow-xl space-y-3">
            <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto" />
            <p className="text-xs text-slate-500 font-medium">Verifying cryptographic share link...</p>
          </div>
        ) : error ? (
          /* Error State Card */
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-xl space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                {error.code === 'SHARE_EXPIRED'
                  ? 'Share Link Expired'
                  : error.code === 'DOWNLOAD_LIMIT_REACHED'
                  ? 'Download Limit Reached'
                  : 'Link Unavailable'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                {error.message}
              </p>
            </div>
            <div className="pt-2">
              <a
                href="/"
                className="inline-block px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                Return to Login
              </a>
            </div>
          </div>
        ) : meta ? (
          /* Active Share File Card */
          <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-7 shadow-2xl space-y-6">
            {/* File Header */}
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-navy-800 flex items-center justify-center mx-auto shadow-inner">
                {getFileIcon(meta.fileName)}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 break-words px-2" title={meta.fileName}>
                  {meta.fileName}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">{formatBytes(meta.fileSize)}</p>
              </div>
            </div>

            {/* Badges / Policy Details */}
            <div className="flex items-center justify-center gap-2 flex-wrap text-[11px]">
              <span className="px-2.5 py-1 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-medium">
                {meta.permission === 'VIEW_ONLY' ? 'View Only (No Download)' : 'Download Permitted'}
              </span>
              {meta.isPasswordProtected && (
                <span className="px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Password Protected
                </span>
              )}
              {meta.expiresAt && (
                <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-navy-800 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Expires {new Date(meta.expiresAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Password input form if protected */}
            {meta.isPasswordProtected && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                  Enter Password to Unlock File
                </label>
                <input
                  type="password"
                  placeholder="Passcode provided by sender"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-navy-800 px-3.5 py-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {passwordError && (
                  <p className="text-[11px] text-red-500 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {passwordError}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              {meta.permission === 'DOWNLOAD' ? (
                <button
                  onClick={() => handleDownloadOrPreview(false)}
                  disabled={downloading || (meta.isPasswordProtected && !password.trim())}
                  className="w-full py-3 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-sky-600/20 flex items-center justify-center gap-2 transition-all"
                >
                  <Download className="w-4 h-4" />
                  {downloading ? 'Decrypting & Streaming...' : 'Download File'}
                </button>
              ) : (
                <button
                  onClick={() => handleDownloadOrPreview(true)}
                  disabled={downloading || (meta.isPasswordProtected && !password.trim())}
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all"
                >
                  <Eye className="w-4 h-4" />
                  {downloading ? 'Opening Preview...' : 'View Document (In-Browser)'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full py-4 text-center text-xs text-slate-400">
        Host Laptop Storage Pool &bull; Restricted to institutional academic sharing
      </footer>
    </div>
  );
};

export default PublicShare;
