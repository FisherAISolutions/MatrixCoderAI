'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface SignUpFormData {
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

interface Props {
  onSwitchToLogin: () => void;
}

export default function SignUpForm({ onSwitchToLogin }: Props) {
  const router = useRouter();
  const { signUp } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpFormData>();

  const passwordValue = watch('password');

  const getPasswordStrength = (pw: string) => {
    if (!pw) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 1) return { score, label: 'WEAK', color: 'bg-matrix-red' };
    if (score <= 3) return { score, label: 'MODERATE', color: 'bg-matrix-amber' };
    return { score, label: 'STRONG', color: 'bg-matrix-green' };
  };

  const strength = getPasswordStrength(passwordValue);

  const onSubmit = async (data: SignUpFormData) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      // Supabase Auth signUp({ email, password }) + create user profile row
      await signUp(data.email, data.password);
      toast.success('Account initialized', {
        description: 'Deploying your Matrix Coder AI workspace...',
        style: { background: '#0d1a0d', border: '1px solid #00ff66', color: '#00ff66' },
      });
      setTimeout(() => router.push('/projects'), 700);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create account';
      setAuthError(message);
      toast.error('Account initialization failed', {
        description: message,
        style: { background: '#1a0d0d', border: '1px solid #ff3333', color: '#ff3333' },
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} method="post" action="/sign-up-login-screen" className="flex flex-col gap-4" noValidate>
      {/* Email */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">
          // EMAIL
        </label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="you@yourdomain.dev"
          className={`w-full rounded-lg border border-matrix-border bg-matrix-surface/90 px-3 py-2.5 text-sm font-mono text-matrix-green shadow-inner shadow-black/20 placeholder-matrix-green-muted outline-none transition-all duration-150 ${
            errors.email
              ? 'border-matrix-red' :'border-matrix-border focus:border-matrix-green focus:shadow-neon-input'
          }`}
          {...register('email', {
            required: 'Email required',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email format' },
          })}
        />
        {errors.email && <p className="text-xs text-matrix-red font-mono">! {errors.email.message}</p>}
      </div>

      {/* Password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-password" className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">
          // PASSWORD
        </label>
        <p className="text-xs text-matrix-green-muted font-mono -mt-0.5">
          Min 8 chars, include symbols for strong encryption
        </p>
        <div className="relative">
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="****************"
            className={`w-full rounded-lg border border-matrix-border bg-matrix-surface/90 px-3 py-2.5 pr-10 text-sm font-mono text-matrix-green shadow-inner shadow-black/20 placeholder-matrix-green-muted outline-none transition-all duration-150 ${
              errors.password
                ? 'border-matrix-red' :'border-matrix-border focus:border-matrix-green focus:shadow-neon-input'
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
        {/* Strength meter */}
        {passwordValue && (
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex gap-0.5 flex-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={`strength-bar-${i}`}
                  className={`h-1 flex-1 rounded-full transition-all duration-200 ${
                    i < strength.score ? strength.color : 'bg-matrix-green-ghost'
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs font-mono tracking-widest ${
              strength.label === 'STRONG' ? 'text-matrix-green' :
              strength.label === 'MODERATE' ? 'text-matrix-amber' : 'text-matrix-red'
            }`}>{strength.label}</span>
          </div>
        )}
        {errors.password && <p className="text-xs text-matrix-red font-mono">! {errors.password.message}</p>}
      </div>

      {/* Confirm Password */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-confirm" className="text-xs font-mono text-matrix-green-muted tracking-widest uppercase">
          // CONFIRM PASSWORD
        </label>
        <div className="relative">
          <input
            id="signup-confirm"
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="****************"
            className={`w-full rounded-lg border border-matrix-border bg-matrix-surface/90 px-3 py-2.5 pr-10 text-sm font-mono text-matrix-green shadow-inner shadow-black/20 placeholder-matrix-green-muted outline-none transition-all duration-150 ${
              errors.confirmPassword
                ? 'border-matrix-red' :'border-matrix-border focus:border-matrix-green focus:shadow-neon-input'
            }`}
            {...register('confirmPassword', {
              required: 'Please confirm password',
              validate: (v) => v === passwordValue || 'Passwords do not match',
            })}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-matrix-green-muted hover:text-matrix-green transition-colors"
            aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
          >
            {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {errors.confirmPassword && (
          <p className="text-xs text-matrix-red font-mono">! {errors.confirmPassword.message}</p>
        )}
      </div>

      {/* Terms */}
      <div className="flex items-start gap-2">
        <input
          id="signup-terms"
          type="checkbox"
          className="accent-matrix-green w-3.5 h-3.5 mt-0.5 flex-shrink-0"
          {...register('acceptTerms', { required: 'You must accept the terms' })}
        />
        <label htmlFor="signup-terms" className="text-xs font-mono text-matrix-green-muted cursor-pointer leading-relaxed">
          I accept the{' '}
          <a href="#" className="text-matrix-green hover:underline">Terms of Service</a>
          {' '}and{' '}
          <a href="#" className="text-matrix-green hover:underline">Privacy Policy</a>
        </label>
      </div>
      {errors.acceptTerms && (
        <p className="text-xs text-matrix-red font-mono -mt-2">! {errors.acceptTerms.message}</p>
      )}

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
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            INITIALIZING...
          </span>
        ) : (
          '// CREATE ACCOUNT'
        )}
      </button>

      <p className="text-xs font-mono text-matrix-green-muted text-center">
        Already deployed?{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="text-matrix-green hover:underline underline-offset-2 transition-colors"
        >
          Login to session {'->'}
        </button>
      </p>
    </form>
  );
}
