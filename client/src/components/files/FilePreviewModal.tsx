import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  X,
  Download,
  Copy,
  Check,
  FileText,
  Eye,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

interface FilePreviewModalProps {
  file: { id: string; name: string; sizeBytes: number | string; mimeType?: string } | null;
  isOpen: boolean;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && file) {
      loadPreview();
    } else {
      cleanup();
    }
    return () => cleanup();
  }, [isOpen, file]);

  const cleanup = () => {
    if (blobUrl) {
      window.URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setTextContent(null);
    setError(null);
  };

  const loadPreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const res = await axios.get(`/api/v1/files/${file.id}/download?inline=true`, {
        responseType: 'blob',
      });

      const contentType = (res.headers['content-type'] as string) || undefined;
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      let targetMime = file.mimeType || contentType || 'application/octet-stream';
      if (ext === 'pdf') targetMime = 'application/pdf';
      else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) {
        targetMime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      } else if (['txt', 'log', 'csv', 'md', 'json', 'py', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'sh'].includes(ext)) {
        targetMime = 'text/plain;charset=utf-8';
      }

      const blob = new Blob([res.data], { type: targetMime });
      const url = window.URL.createObjectURL(blob);
      setBlobUrl(url);

      const isText =
        ['txt', 'md', 'json', 'ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'html', 'css', 'sql', 'yml', 'yaml', 'sh', 'log', 'csv', 'xml', 'env'].includes(ext) ||
        (targetMime && targetMime.startsWith('text/'));

      if (isText) {
        const text = await blob.text();
        setTextContent(text);
      }
    } catch {
      setError('Unable to load decrypted file preview. Please try downloading the file.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenInNewTab = () => {
    if (!blobUrl) return;
    window.open(blobUrl, '_blank');
  };

  const handleDownload = () => {
    if (!blobUrl || !file) return;
    const link = document.createElement('a');
    link.href = blobUrl;
    link.setAttribute('download', file.name);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleCopyText = () => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen || !file) return null;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext);
  const isPdf = ext === 'pdf' || file.mimeType === 'application/pdf';
  const isAudio = ['mp3', 'wav', 'ogg', 'aac'].includes(ext);
  const isVideo = ['mp4', 'webm', 'mov'].includes(ext);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-navy-900">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400">
              <Eye className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate max-w-md" title={file.name}>
                {file.name}
              </h3>
              <p className="text-[11px] text-slate-400">In-Browser Decrypted Preview &bull; Tenant Scoped</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenInNewTab}
              disabled={!blobUrl}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-navy-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              title="Open file directly in a new browser tab"
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-500" /> Open in New Tab
            </button>
            {textContent && (
              <button
                onClick={handleCopyText}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-navy-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors"
                title="Copy Text to Clipboard"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Viewer Body */}
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-slate-100/50 dark:bg-navy-950/50 min-h-[350px]">
          {loading ? (
            <div className="text-center space-y-2">
              <RefreshCw className="w-8 h-8 text-sky-500 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 font-medium">Decrypting ciphertext on-the-fly...</p>
            </div>
          ) : error ? (
            <div className="text-center space-y-3 p-8">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
              <p className="text-xs text-slate-600 dark:text-slate-300 max-w-sm mx-auto">{error}</p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm"
              >
                Download File Instead
              </button>
            </div>
          ) : isImage && blobUrl ? (
            <div className="max-h-[70vh] overflow-auto flex items-center justify-center p-2">
              <img
                src={blobUrl}
                alt={file.name}
                className="max-h-[65vh] max-w-full rounded-2xl object-contain shadow-md border border-slate-200 dark:border-slate-800"
              />
            </div>
          ) : isPdf && blobUrl ? (
            <iframe
              src={blobUrl}
              title={file.name}
              className="w-full h-[70vh] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white"
            />
          ) : isAudio && blobUrl ? (
            <div className="bg-white dark:bg-navy-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md text-center space-y-4">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{file.name}</p>
              <audio controls src={blobUrl} className="mx-auto" />
            </div>
          ) : isVideo && blobUrl ? (
            <div className="max-h-[70vh] flex items-center justify-center">
              <video controls src={blobUrl} className="max-h-[65vh] rounded-2xl shadow-md border border-slate-200 dark:border-slate-800" />
            </div>
          ) : ext === 'csv' && textContent !== null ? (
            <div className="w-full max-h-[65vh] overflow-auto bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-2">
              <table className="w-full text-left text-xs font-mono">
                <tbody>
                  {textContent.trim().split('\n').map((row, rIdx) => {
                    const cols = row.split(',');
                    return (
                      <tr
                        key={rIdx}
                        className={
                          rIdx === 0
                            ? 'bg-slate-100 dark:bg-navy-800 font-bold border-b border-slate-200 dark:border-slate-700'
                            : 'border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-navy-800/40'
                        }
                      >
                        {cols.map((col, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 whitespace-nowrap text-slate-800 dark:text-slate-200">
                            {col.trim()}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : ['doc', 'docx'].includes(ext) ? (
            <div className="bg-white dark:bg-navy-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-md max-w-md">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center mx-auto">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{file.name}</h4>
                <p className="text-xs text-slate-400 mt-1">Microsoft Word Document &bull; AES-256-GCM Encrypted</p>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Click below to open the decrypted document in a new tab or save it directly to your system.
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={handleOpenInNewTab}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-navy-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-sky-500" /> Open in New Tab
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-4 h-4" /> Download & Open
                </button>
              </div>
            </div>
          ) : textContent !== null ? (
            <div className="w-full h-[65vh] bg-slate-900 text-slate-100 rounded-2xl p-4 overflow-auto border border-slate-800 font-mono text-xs shadow-inner">
              <pre className="whitespace-pre-wrap leading-relaxed">{textContent}</pre>
            </div>
          ) : (
            <div className="bg-white dark:bg-navy-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3 shadow-md max-w-sm">
              <FileText className="w-12 h-12 text-slate-400 mx-auto" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Direct Preview Unavailable</h4>
              <p className="text-xs text-slate-400">
                This file format cannot be rendered directly in the browser. You can download and decrypt the file to your computer.
              </p>
              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm inline-flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;
