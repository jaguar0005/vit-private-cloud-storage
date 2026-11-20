import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Login } from './pages/Login';
import { PublicShare } from './pages/PublicShare';
import { AdminDashboard } from './pages/AdminDashboard';
import { FileBrowser } from './components/files/FileBrowser';
import { Cloud, HardDrive, LogOut, Shield, ShieldAlert, Sun, Moon } from 'lucide-react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const AuthenticatedHome: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  if (!user) return null;

  const usedMb = (user.usedBytes / (1024 * 1024)).toFixed(1);
  const totalMb = (user.quotaBytes / (1024 * 1024)).toFixed(0);
  const percentage = Math.min(100, Math.round((user.usedBytes / user.quotaBytes) * 100));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-navy-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center font-bold">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">VIT Private Cloud Storage</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Personal Vault &bull; 200 MB Quota</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {user.role === 'ADMIN' && (
            <Link
              to="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shadow-sm"
            >
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">Admin Console</span>
            </Link>
          )}

          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold">{user.email}</p>
            <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-bold bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
              {user.role}
            </span>
          </div>

          <button
            onClick={() => logout()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 transition-colors"
          >
            <LogOut className="w-4 h-4 text-red-500" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Welcome Banner */}
        <div className="bg-white dark:bg-navy-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Welcome, {user.email.split('@')[0]}!</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Your institutional storage vault is encrypted and operational.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium">
            <Shield className="w-4 h-4" />
            <span>AES-256 Envelope Crypto Active</span>
          </div>
        </div>

        {/* Quota Gauge Card */}
        <div className="bg-white dark:bg-navy-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              <h3 className="text-sm font-semibold">Personal Storage Meter</h3>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {usedMb} MB used of {totalMb} MB ({percentage}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 dark:bg-navy-800 h-3 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                percentage > 90 ? 'bg-red-500' : percentage > 70 ? 'bg-amber-500' : 'bg-sky-500'
              }`}
              style={{ width: `${Math.max(percentage, 2)}%` }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div>Allocation: <strong className="text-slate-800 dark:text-slate-200">{totalMb} MB</strong></div>
            <div>Free Space: <strong className="text-slate-800 dark:text-slate-200">{Math.max(0, Number(totalMb) - Number(usedMb)).toFixed(1)} MB</strong></div>
            <div>Isolation: <strong className="text-slate-800 dark:text-slate-200">Tenant Scoped</strong></div>
            <div>Status: <strong className="text-emerald-600 dark:text-emerald-400">Normal</strong></div>
          </div>
        </div>

        {/* File and Folder Management Workspace */}
        <FileBrowser />
      </main>
    </div>
  );
};

const AppRoutes: React.FC = () => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-navy-950 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-sky-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/share/:token" element={<PublicShare />} />
      <Route path="/login" element={!user ? <Login /> : <Navigate to="/" replace />} />
      <Route
        path="/admin"
        element={
          !user ? (
            <Navigate to="/login" replace />
          ) : user.role === 'ADMIN' ? (
            <AdminDashboard />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="/" element={user ? <AuthenticatedHome /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
