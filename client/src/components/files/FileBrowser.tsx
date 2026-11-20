import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder as FolderIcon,
  FileText,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  File,
  Upload,
  FolderPlus,
  Download,
  Trash2,
  Edit2,
  ChevronRight,
  LayoutGrid,
  List,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  HardDrive,
  Share2,
  History,
  Eye,
  PieChart as PieChartIcon,
  Search,
  Filter,
  ShieldAlert,
  FolderTree,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ShareModal } from './ShareModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { RecycleBin } from './RecycleBin';
import { FilePreviewModal } from './FilePreviewModal';
import { StorageAnalyticsModal } from '../analytics/StorageAnalyticsModal';

interface FolderItem {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
}

interface FileItem {
  id: string;
  name: string;
  storageUuid: string;
  mimeType: string;
  sizeBytes: number;
  sha256Hash: string;
  folderId: string | null;
  isStarred: boolean;
  createdAt: string;
}

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

interface ContentsResponse {
  currentFolderId: string | null;
  breadcrumbs: BreadcrumbItem[];
  folders: FolderItem[];
  files: FileItem[];
}

export const FileBrowser: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
  const [isDragOver, setIsDragOver] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Navigation & Modals state
  const [activeTab, setActiveTab] = useState<'FILES' | 'TRASH'>('FILES');
  const [shareTargetFile, setShareTargetFile] = useState<{ id: string; name: string } | null>(null);
  const [versionTargetFile, setVersionTargetFile] = useState<{ id: string; name: string } | null>(null);
  const [previewTargetFile, setPreviewTargetFile] = useState<{ id: string; name: string; sizeBytes: number | string; mimeType?: string } | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string; type: 'FILE' | 'FOLDER' } | null>(null);
  const [renameInput, setRenameInput] = useState('');

  // Upload progress state
  const [uploadProgress, setUploadProgress] = useState<{ active: boolean; filename: string; percent: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'SUCCESS' | 'ERROR'; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isSearchActive = searchQuery.trim().length > 0 || selectedCategory !== 'ALL';

  // Fetch folder contents
  const { data, isLoading } = useQuery<ContentsResponse>({
    queryKey: ['folderContents', currentFolderId],
    queryFn: async () => {
      const url = currentFolderId
        ? `/api/v1/folders/contents?folderId=${currentFolderId}`
        : '/api/v1/folders/contents';
      const res = await axios.get(url);
      return res.data.data;
    },
    enabled: !isSearchActive,
  });

  // Search query
  const { data: searchResults, isLoading: isSearchLoading } = useQuery<FileItem[]>({
    queryKey: ['fileSearch', searchQuery, selectedCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedCategory !== 'ALL') params.append('category', selectedCategory);
      const res = await axios.get(`/api/v1/search?${params.toString()}`);
      return res.data.data?.files || [];
    },
    enabled: isSearchActive,
  });

  const showToast = (text: string, type: 'SUCCESS' | 'ERROR' = 'SUCCESS') => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await axios.post('/api/v1/folders', {
        name,
        parentId: currentFolderId,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      setShowNewFolderModal(false);
      setNewFolderName('');
      showToast('Folder created successfully.');
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        showToast(err.response.data.error.message, 'ERROR');
      } else {
        showToast('Failed to create folder.', 'ERROR');
      }
    },
  });

  // Rename mutation
  const renameMutation = useMutation({
    mutationFn: async ({ id, name, type }: { id: string; name: string; type: 'FILE' | 'FOLDER' }) => {
      const url = type === 'FOLDER' ? `/api/v1/folders/${id}/rename` : `/api/v1/files/${id}/rename`;
      const res = await axios.patch(url, { name });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      if (isSearchActive) queryClient.invalidateQueries({ queryKey: ['fileSearch'] });
      setRenameTarget(null);
      setRenameInput('');
      showToast('Renamed successfully.');
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        showToast(err.response.data.error.message, 'ERROR');
      } else {
        showToast('Rename failed.', 'ERROR');
      }
    },
  });

  // Soft delete folder or file
  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'FILE' | 'FOLDER' }) => {
      const url = type === 'FOLDER' ? `/api/v1/folders/${id}` : `/api/v1/files/${id}`;
      const res = await axios.delete(url);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      if (isSearchActive) queryClient.invalidateQueries({ queryKey: ['fileSearch'] });
      refreshUser();
      showToast('Moved to Recycle Bin.');
    },
    onError: () => {
      showToast('Failed to delete item.', 'ERROR');
    },
  });

  // Upload file handler
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];

    // Check personal quota check client-side for immediate feedback
    if (user && user.usedBytes + file.size > user.quotaBytes) {
      showToast(`Upload exceeds remaining quota! Max 200 MB per student.`, 'ERROR');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId) {
      formData.append('folderId', currentFolderId);
    }

    setUploadProgress({ active: true, filename: file.name, percent: 10 });

    try {
      await axios.post('/api/v1/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const pct = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress({ active: true, filename: file.name, percent: pct });
          }
        },
      });

      queryClient.invalidateQueries({ queryKey: ['folderContents'] });
      if (isSearchActive) queryClient.invalidateQueries({ queryKey: ['fileSearch'] });
      refreshUser();
      showToast(`"${file.name}" uploaded successfully!`);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.data?.error?.message) {
        showToast(err.response.data.error.message, 'ERROR');
      } else {
        showToast('Upload failed.', 'ERROR');
      }
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Download file handler
  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const res = await axios.get(`/api/v1/files/${fileId}/download`, {
        responseType: 'blob',
      });
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      showToast('Failed to download file.', 'ERROR');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const getFileIcon = (name: string, _mime?: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(ext || '')) return <ImageIcon className="w-5 h-5 text-emerald-500" />;
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext || '')) return <FileArchive className="w-5 h-5 text-amber-500" />;
    if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'c', 'cpp', 'html', 'css', 'json'].includes(ext || '')) return <FileCode className="w-5 h-5 text-indigo-500" />;
    if (['pdf', 'doc', 'docx', 'txt', 'md'].includes(ext || '')) return <FileText className="w-5 h-5 text-sky-500" />;
    return <File className="w-5 h-5 text-slate-400" />;
  };

  const filesToDisplay: FileItem[] = isSearchActive
    ? (Array.isArray(searchResults) ? searchResults : [])
    : (data?.files || []);

  return (
    <div
      className={`space-y-4 relative ${
        isDragOver ? 'ring-2 ring-sky-500 bg-sky-50/5 dark:bg-sky-950/20 rounded-2xl' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFileUpload(e.dataTransfer.files);
      }}
    >
      {/* Hidden native file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFileUpload(e.target.files)}
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-xl shadow-xl border flex items-center gap-3 transition-all ${
            toastMessage.type === 'SUCCESS'
              ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
        >
          {toastMessage.type === 'SUCCESS' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span className="text-sm font-medium">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Progress Banner */}
      {uploadProgress && (
        <div className="bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <RefreshCw className="w-5 h-5 text-sky-600 animate-spin shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-sky-900 dark:text-sky-200 truncate">
                Uploading {uploadProgress.filename}...
              </p>
              <div className="w-full bg-sky-200 dark:bg-sky-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="bg-sky-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percent}%` }}
                />
              </div>
            </div>
          </div>
          <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
            {uploadProgress.percent}%
          </span>
        </div>
      )}

      {/* Admin Multi-Tenant Notice Banner */}
      {user?.role === 'ADMIN' && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 dark:bg-amber-900/60 rounded-xl text-amber-700 dark:text-amber-300 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <span>Administrator Governance Active</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900 text-amber-800 dark:text-amber-300 font-extrabold uppercase">
                  Multi-Tenant
                </span>
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                You are currently viewing <strong className="underline">admin@vit.edu</strong>'s personal tenant vault (empty). To inspect, download, or manage all student files across the private cloud, open the <strong>Admin Console</strong>.
              </p>
            </div>
          </div>
          <Link
            to="/admin"
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1.5 shrink-0 transition-colors self-start sm:self-auto"
          >
            <FolderTree className="w-4 h-4" />
            <span>Open All System Files &rarr;</span>
          </Link>
        </div>
      )}

      {/* Top Navigation Tabs & Quick Analytics Button */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setActiveTab('FILES');
              setSearchQuery('');
              setSelectedCategory('ALL');
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'FILES'
                ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/20'
                : 'bg-white dark:bg-navy-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>My Personal Vault</span>
          </button>

          {user?.role === 'ADMIN' && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all"
            >
              <FolderTree className="w-4 h-4" />
              <span>All Institutional Files (Admin)</span>
            </Link>
          )}

          <button
            onClick={() => setActiveTab('TRASH')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'TRASH'
                ? 'bg-red-600 text-white shadow-sm shadow-red-600/20'
                : 'bg-white dark:bg-navy-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-800'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>Recycle Bin (30-Day Auto Purge)</span>
          </button>
        </div>

        <button
          onClick={() => setShowAnalyticsModal(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-sky-400 dark:hover:border-sky-600 transition-all shadow-sm"
        >
          <PieChartIcon className="w-4 h-4 text-sky-500" />
          <span>Storage Telemetry</span>
        </button>
      </div>

      {activeTab === 'TRASH' ? (
        <RecycleBin
          showToast={showToast}
          onItemRestored={() => queryClient.invalidateQueries({ queryKey: ['folderContents'] })}
        />
      ) : (
        <>
          {/* Action Toolbar & Search Bar */}
          <div className="bg-white dark:bg-navy-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            {/* Top Bar: Breadcrumb + Primary Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Breadcrumb Trail (Hidden when searching) */}
              {isSearchActive ? (
                <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 dark:text-sky-400">
                  <Search className="w-4 h-4" />
                  <span>Searching Vault Files</span>
                </div>
              ) : (
                <nav className="flex items-center gap-1.5 text-sm overflow-x-auto py-1">
                  {data?.breadcrumbs.map((crumb, idx) => {
                    const isLast = idx === (data.breadcrumbs.length - 1);
                    return (
                      <React.Fragment key={crumb.id || 'root'}>
                        <button
                          onClick={() => setCurrentFolderId(crumb.id)}
                          className={`px-2 py-1 rounded-lg transition-colors font-medium whitespace-nowrap ${
                            isLast
                              ? 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/60'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800'
                          }`}
                        >
                          {crumb.name}
                        </button>
                        {!isLast && <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                      </React.Fragment>
                    );
                  })}
                </nav>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {!isSearchActive && (
                  <button
                    onClick={() => setShowNewFolderModal(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-navy-800 dark:hover:bg-navy-700 text-slate-700 dark:text-slate-200 text-xs font-medium transition-all"
                  >
                    <FolderPlus className="w-4 h-4 text-sky-500" />
                    <span>New Folder</span>
                  </button>
                )}

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium shadow-sm transition-all"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload File</span>
                </button>

                <div className="border-l border-slate-200 dark:border-slate-800 h-6 mx-1" />

                {/* Grid/List View Toggle */}
                <div className="flex items-center bg-slate-100 dark:bg-navy-800 rounded-xl p-0.5">
                  <button
                    onClick={() => setViewMode('GRID')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewMode === 'GRID'
                        ? 'bg-white dark:bg-navy-900 text-sky-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('LIST')}
                    className={`p-1.5 rounded-lg transition-all ${
                      viewMode === 'LIST'
                        ? 'bg-white dark:bg-navy-900 text-sky-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Bar: Search Input & Category Pills */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search file names in vault..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-slate-50 dark:bg-navy-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto py-1">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'DOCUMENTS', label: 'Docs' },
                  { id: 'IMAGES', label: 'Images' },
                  { id: 'MEDIA', label: 'Media' },
                  { id: 'ARCHIVES', label: 'Archives' },
                  { id: 'CODE', label: 'Code' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800'
                        : 'bg-slate-50 dark:bg-navy-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-700 border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Search Results Banner */}
          {isSearchActive && (
            <div className="bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-sky-900 dark:text-sky-200">
                <Filter className="w-4 h-4 text-sky-500" />
                <span>
                  Found <strong>{filesToDisplay.length}</strong> matching file(s)
                  {searchQuery ? ` for "${searchQuery}"` : ''}
                  {selectedCategory !== 'ALL' ? ` in ${selectedCategory}` : ''}
                </span>
              </div>
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                }}
                className="text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
              >
                <span>Clear search filter</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Loading state */}
          {(isLoading || isSearchLoading) ? (
            <div className="bg-white dark:bg-navy-900 rounded-2xl p-12 border border-slate-200 dark:border-slate-800 flex justify-center items-center">
              <RefreshCw className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Empty state */}
              {!isSearchActive && (!data?.folders || data.folders.length === 0) && (!data?.files || data.files.length === 0) ? (
                <div className="bg-white dark:bg-navy-900 rounded-2xl p-12 border border-dashed border-slate-300 dark:border-slate-800 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-navy-800 text-sky-500 flex items-center justify-center mx-auto mb-3">
                    <HardDrive className="w-7 h-7" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">This folder is empty</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Drag and drop files directly onto this window, or click Upload to store lecture slides, notes, or archives.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => setShowNewFolderModal(true)}
                      className="px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-navy-800 hover:bg-slate-200 dark:hover:bg-navy-700 font-medium"
                    >
                      Create Subfolder
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium"
                    >
                      Upload Files
                    </button>
                  </div>
                </div>
              ) : isSearchActive && filesToDisplay.length === 0 ? (
                <div className="bg-white dark:bg-navy-900 rounded-2xl p-12 border border-dashed border-slate-300 dark:border-slate-800 text-center">
                  <Search className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No matching files found</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                    Try adjusting your search query or changing the category filter to locate your file.
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('ALL');
                    }}
                    className="mt-4 px-4 py-2 text-xs rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold"
                  >
                    Reset Filter
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Folders Section (Only in folder browse mode) */}
                  {!isSearchActive && data && data.folders.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 px-1">
                        Folders ({data.folders.length})
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {data.folders.map((f) => (
                          <div
                            key={f.id}
                            className="group bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 hover:border-sky-300 dark:hover:border-sky-700 rounded-xl p-3.5 flex items-center justify-between cursor-pointer transition-all shadow-sm hover:shadow"
                            onClick={() => setCurrentFolderId(f.id)}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <FolderIcon className="w-5 h-5 text-sky-500 shrink-0 fill-sky-500/20" />
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                {f.name}
                              </span>
                            </div>
                            <div
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 ml-2 transition-opacity"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => {
                                  setRenameTarget({ id: f.id, name: f.name, type: 'FOLDER' });
                                  setRenameInput(f.name);
                                }}
                                className="p-1 hover:text-sky-600 rounded text-slate-400"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteMutation.mutate({ id: f.id, type: 'FOLDER' })}
                                className="p-1 hover:text-red-600 rounded text-slate-400"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files Section */}
                  {filesToDisplay.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 px-1">
                        {isSearchActive ? 'Matching Files' : 'Files'} ({filesToDisplay.length})
                      </h4>

                      {viewMode === 'GRID' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {filesToDisplay.map((file) => (
                            <div
                              key={file.id}
                              className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between transition-all shadow-sm"
                            >
                              <div
                                className="flex items-start gap-3 min-w-0 cursor-pointer"
                                onClick={() => setPreviewTargetFile(file)}
                              >
                                <div className="p-2 rounded-lg bg-slate-50 dark:bg-navy-800 shrink-0">
                                  {getFileIcon(file.name, file.mimeType)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate hover:text-sky-600 dark:hover:text-sky-400" title={file.name}>
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-0.5">
                                    {formatBytes(file.sizeBytes)} &bull; {new Date(file.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setPreviewTargetFile(file)}
                                  className="p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                                  title="In-Browser Decrypted Preview"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setShareTargetFile({ id: file.id, name: file.name })}
                                  className="p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                                  title="Share File"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setVersionTargetFile({ id: file.id, name: file.name })}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                                  title="Version History"
                                >
                                  <History className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDownload(file.id, file.name)}
                                  className="p-1.5 text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                                  title="Download Decrypted File"
                                >
                                  <Download className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    setRenameTarget({ id: file.id, name: file.name, type: 'FILE' });
                                    setRenameInput(file.name);
                                  }}
                                  className="p-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                                  title="Rename File"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => deleteMutation.mutate({ id: file.id, type: 'FILE' })}
                                  className="p-1.5 text-slate-500 hover:text-red-600 rounded-lg hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
                                  title="Move to Recycle Bin"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        /* Table View */
                        <div className="bg-white dark:bg-navy-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-slate-50 dark:bg-navy-800/60 text-slate-500 text-xs uppercase border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="py-3 px-4">Name</th>
                                <th className="py-3 px-4">Size</th>
                                <th className="py-3 px-4">Uploaded</th>
                                <th className="py-3 px-4 text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {filesToDisplay.map((file) => (
                                <tr key={file.id} className="hover:bg-slate-50/50 dark:hover:bg-navy-800/30">
                                  <td
                                    className="py-3 px-4 flex items-center gap-2.5 cursor-pointer"
                                    onClick={() => setPreviewTargetFile(file)}
                                  >
                                    {getFileIcon(file.name, file.mimeType)}
                                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-xs hover:text-sky-600 dark:hover:text-sky-400">
                                      {file.name}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-xs text-slate-500">{formatBytes(file.sizeBytes)}</td>
                                  <td className="py-3 px-4 text-xs text-slate-500">{new Date(file.createdAt).toLocaleDateString()}</td>
                                  <td className="py-3 px-4 text-right">
                                    <div className="inline-flex items-center gap-1">
                                      <button
                                        onClick={() => setPreviewTargetFile(file)}
                                        className="p-1.5 hover:text-sky-600 rounded text-slate-500"
                                        title="Preview File"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setShareTargetFile({ id: file.id, name: file.name })}
                                        className="p-1.5 hover:text-sky-600 rounded text-slate-500"
                                        title="Share File"
                                      >
                                        <Share2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => setVersionTargetFile({ id: file.id, name: file.name })}
                                        className="p-1.5 hover:text-indigo-600 rounded text-slate-500"
                                        title="Version History"
                                      >
                                        <History className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDownload(file.id, file.name)}
                                        className="p-1.5 hover:text-sky-600 rounded text-slate-500"
                                        title="Download File"
                                      >
                                        <Download className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          setRenameTarget({ id: file.id, name: file.name, type: 'FILE' });
                                          setRenameInput(file.name);
                                        }}
                                        className="p-1.5 hover:text-slate-700 dark:hover:text-slate-300 rounded text-slate-500"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => deleteMutation.mutate({ id: file.id, type: 'FILE' })}
                                        className="p-1.5 hover:text-red-600 rounded text-slate-500"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 mb-4">Create New Folder</h3>
            <input
              type="text"
              placeholder="Folder Name (e.g. Lab Assignments)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewFolderModal(false);
                  setNewFolderName('');
                }}
                className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                disabled={!newFolderName.trim() || createFolderMutation.isPending}
                onClick={() => createFolderMutation.mutate(newFolderName)}
                className="px-4 py-2 text-xs font-medium rounded-xl bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
              >
                {createFolderMutation.isPending ? 'Creating...' : 'Create Folder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-navy-900 rounded-2xl max-w-sm w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 mb-4">
              Rename {renameTarget.type === 'FOLDER' ? 'Folder' : 'File'}
            </h3>
            <input
              type="text"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-navy-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setRenameTarget(null);
                  setRenameInput('');
                }}
                className="px-4 py-2 text-xs font-medium rounded-xl hover:bg-slate-100 dark:hover:bg-navy-800 text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                disabled={!renameInput.trim() || renameMutation.isPending}
                onClick={() =>
                  renameMutation.mutate({
                    id: renameTarget.id,
                    name: renameInput,
                    type: renameTarget.type,
                  })
                }
                className="px-4 py-2 text-xs font-medium rounded-xl bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-50"
              >
                {renameMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <ShareModal
        file={shareTargetFile}
        isOpen={!!shareTargetFile}
        onClose={() => setShareTargetFile(null)}
        showToast={showToast}
      />

      {/* Version History Modal */}
      <VersionHistoryModal
        file={versionTargetFile}
        isOpen={!!versionTargetFile}
        onClose={() => setVersionTargetFile(null)}
        showToast={showToast}
        onReverted={() => queryClient.invalidateQueries({ queryKey: ['folderContents'] })}
      />

      {/* In-Browser File Preview Modal */}
      <FilePreviewModal
        file={previewTargetFile}
        isOpen={!!previewTargetFile}
        onClose={() => setPreviewTargetFile(null)}
      />

      {/* Storage Analytics & Telemetry Modal */}
      <StorageAnalyticsModal
        isOpen={showAnalyticsModal}
        onClose={() => setShowAnalyticsModal(false)}
      />
    </div>
  );
};

export default FileBrowser;
