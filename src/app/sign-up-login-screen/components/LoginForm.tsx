'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Terminal, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface LoginFormData {
  email: string;
  password: string;
  rememberMe: boolean;
}

const DEMO_CREDENTIALS = {
  email: 'dev@codepilot.sh',
  password: 'matrix://pilot#2026',
};

interface Props {
  onSwitchToSignup: () => void;
}

export default function LoginForm({ onSwitchToSignup }: Props) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({ defaultValues: { rememberMe: false } });

  const autofillDemo = () => {
    setValue('email', DEMO_CREDENTIALS.email);
    setValue('password', DEMO_CREDENTIALS.password);
    toast.success('Demo credentials loaded', {
      description: 'Click Login to authenticate',
      style: { background: '#0d1a0d', border: '1px solid #0a5c25', color: '#00ff66' },
    });
  };

  const copyField = async (field: 'email' | 'password') => {
    await navigator.clipboard.writeText(DEMO_CREDENTIALS[field]);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      // Supabase Auth signInWithPassword({ email, password })
      await signIn(data.email, data.password);

      toast.success('Authentication successful', {
        description: 'Initializing Matrix Coder AI workspace...',
        style: { background: '#0d1a0d', border: '1px solid #00ff66', color: '#00ff66' },
      });
      setTimeout(() => router.push('/chat-workspace'), 600);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setAuthError(message);
      toast.error('Sign in could not complete', {
        description: message,
        style: { background: '#1a0000', border: '1px solid #ff4444', color: '#ff4444' },
      });
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} method="post" action="/sign-up-login-screen" className="flex flex-col gap-4" noValidate>
      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">
          // EMAIL
        </label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          placeholder="dev@codepilot.sh"
          className={`w-full rounded-lg border border-matrix-border bg-matrix-surface/90 px-3 py-2.5 text-sm font-mono text-matrix-green shadow-inner shadow-black/20 placeholder-matrix-green-muted outline-none transition-all duration-150 ${
            errors.email
              ? 'border-matrix-red focus:shadow-[0_0_0_1px_#ff4444]'
              : 'border-matrix-border focus:border-matrix-green focus:shadow-neon-input'
          }`}
          {...register('email', {
            required: 'Email required',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email format' },
          })}
        />
        {errors.email && (
          <p className="text-xs text-matrix-red font-mono">! {errors.email.message}</p>
        )}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-password" className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">
          // PASSWORD
        </label>
        <div className="relative">
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="****************"
            className={`w-full rounded-lg border border-matrix-border bg-matrix-surface/90 px-3 py-2.5 pr-10 text-sm font-mono text-matrix-green shadow-inner shadow-black/20 placeholder-matrix-green-muted outline-none transition-all duration-150 ${
              errors.password
                ? 'border-matrix-red focus:shadow-[0_0_0_1px_#ff4444]'
                : 'border-matrix-border focus:border-matrix-green focus:shadow-neon-input'
            }`}
            {...register('password', {
              required: 'Password required',
              minLength: { value: 8, message: 'Minimum 8 characters' },
            })}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-matrix-green-muted hover:text-matrix-green transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {errors.password && (
          <p className="text-xs text-matrix-red font-mono">! {errors.password.message}</p>
        )}
      </div>

      {/* Remember me */}
      <div className="flex items-center gap-2">
        <input
          id="login-remember"
          type="checkbox"
          className="accent-matrix-green w-3.5 h-3.5"
          {...register('rememberMe')}
        />
        <label htmlFor="login-remember" className="text-xs font-mono text-matrix-green-muted cursor-pointer">
          Remember this terminal session
        </label>
      </div>

      {authError && (
        <div className="rounded-lg border border-matrix-red/70 bg-matrix-red/10 px-3 py-2 text-xs font-mono leading-relaxed text-matrix-red" role="alert">
          {authError}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isLoading}
        className="mt-1 w-full rounded-xl bg-matrix-green py-3 text-sm font-mono font-bold uppercase tracking-widest text-black transition-all duration-150 hover:bg-matrix-green-dim active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 neon-glow"
        style={{ minWidth: 0 }}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            AUTHENTICATING...
          </span>
        ) : (
          '// EXECUTE LOGIN'
        )}
      </button>

      {/* Demo credentials box */}
      <div className="mt-2 rounded-xl border border-matrix-border/80 bg-matrix-green-ghost p-3 shadow-[0_0_22px_rgba(0,255,102,0.08)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Terminal size={11} className="text-matrix-green-muted" />
            <span className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">Demo Credentials</span>
          </div>
          <button
            type="button"
            onClick={autofillDemo}
            className="text-xs font-mono text-matrix-green hover:text-matrix-green-dim underline underline-offset-2 transition-colors"
          >
            autofill {'->'}
          </button>
        </div>
        {(['email', 'password'] as const).map((field) => (
          <div key={`cred-${field}`} className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-matrix-green-muted text-xs font-mono w-14 flex-shrink-0">{field}:</span>
              <span className="text-matrix-green text-xs font-mono truncate">
                {field === 'password' ? '****************' : DEMO_CREDENTIALS[field]}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyField(field)}
              className="text-matrix-green-muted hover:text-matrix-green transition-colors flex-shrink-0 ml-2"
              aria-label={`Copy ${field}`}
            >
              {copiedField === field ? <Check size={12} className="text-matrix-green" /> : <Copy size={12} />}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs font-mono text-matrix-green-muted text-center">
        No account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-matrix-green hover:underline underline-offset-2 transition-colors"
        >
          Initialize new session {'->'}
        </button>
      </p>
    </form>
  );
}
