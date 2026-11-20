import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Cloud, ShieldCheck, Lock, AlertCircle, ArrowLeft, CheckCircle2, RefreshCw } from 'lucide-react';

export const Login: React.FC = () => {
  const { requestOtp, verifyOtp } = useAuth();

  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'EMAIL' | 'OTP'>('EMAIL');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(600); // 10 minutes in seconds

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown timer for OTP expiry
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'OTP' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, countdown]);

  const formatCountdown = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.endsWith('@vit.edu')) {
      setError('Registration is restricted to official VIT University emails ending in @vit.edu');
      return;
    }

    setLoading(true);
    try {
      const res = await requestOtp(cleanEmail);
      setInfoMessage(res.message);
      if (res.devOtp) {
        setDevCode(res.devOtp);
      }
      setStep('OTP');
      setCountdown(600);
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, val: string) => {
    const numericVal = val.replace(/\D/g, '');
    const newDigits = [...otpDigits];

    if (numericVal.length > 1) {
      // Handle paste
      const pasted = numericVal.slice(0, 6).split('');
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || '';
      }
      setOtpDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    newDigits[index] = numericVal;
    setOtpDigits(newDigits);

    if (numericVal && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullCode = otpDigits.join('');
    if (fullCode.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email.trim().toLowerCase(), fullCode);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-navy-950 flex flex-col justify-center items-center px-4 py-8">
      {/* Background Decorative Accents */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-400/10 dark:bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 shadow-sm mb-4">
            <Cloud className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            VIT Private Cloud Storage
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Isolated Academic Storage &bull; 200 MB Per Student
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-white dark:bg-navy-900 rounded-2xl shadow-xl border border-slate-200/80 dark:border-slate-800 p-8 backdrop-blur-sm">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 dark:text-red-300">{error}</div>
            </div>
          )}

          {infoMessage && step === 'OTP' && (
            <div className="mb-6 p-4 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
              <div className="text-sm text-sky-800 dark:text-sky-300">{infoMessage}</div>
            </div>
          )}

          {step === 'EMAIL' ? (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Institutional Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="student.name@vit.edu"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-navy-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm transition-all shadow-sm"
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-sky-500" />
                  Only emails matching <span className="font-semibold text-slate-600 dark:text-slate-300">@vit.edu</span> are permitted.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sending Verification Code...
                  </>
                ) : (
                  'Send One-Time Password (OTP)'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                  Enter the 6-digit code sent to
                </p>
                <p className="text-sm font-semibold text-sky-600 dark:text-sky-400">
                  {email}
                </p>
              </div>

              {devCode && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-800 dark:text-amber-300">
                      🔑 Dev Mode Code:
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOtpDigits(devCode.split(''));
                        inputRefs.current[5]?.focus();
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-[11px] shadow-sm transition-colors"
                    >
                      Auto-Fill Code
                    </button>
                  </div>
                  <div className="font-mono text-xl font-black tracking-widest text-amber-900 dark:text-amber-100 text-center bg-white dark:bg-navy-900 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800">
                    {devCode}
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    SMTP credentials are not yet configured in <code>.env</code>. You can log in with this code immediately or configure SMTP to deliver real emails to your <strong>@vit.edu</strong> inbox.
                  </p>
                </div>
              )}

              {/* 6-Digit Code Inputs */}
              <div className="flex justify-between gap-2">
                {otpDigits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => (inputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-navy-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm transition-all"
                  />
                ))}
              </div>

              {/* Timer & Resend */}
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Expires in: <strong className="text-slate-800 dark:text-slate-200">{formatCountdown(countdown)}</strong></span>
                <button
                  type="button"
                  onClick={handleSendOtp}
                  disabled={loading || countdown > 540}
                  className="text-sky-600 dark:text-sky-400 hover:underline disabled:opacity-40"
                >
                  Resend Code
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-medium text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Validating with Server...
                  </>
                ) : (
                  'Verify & Access Storage Vault'
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('EMAIL');
                  setOtpDigits(['', '', '', '', '', '']);
                  setError(null);
                }}
                className="w-full text-center text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Change Email Address
              </button>
            </form>
          )}

          {/* Security Features Callout */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>9-Stage Virus & Bomb Scan</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-violet-500 shrink-0" />
              <span>AES-256 Envelope Crypto</span>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          Cloud Computing Capstone Project &bull; Host Laptop 20 GB Storage Pool
        </p>
      </div>
    </div>
  );
};

export default Login;
