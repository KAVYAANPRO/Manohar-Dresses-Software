import { useState, useEffect } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { AlertCircle, Eye, EyeOff, Lock, User } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { consumeSessionError } from '../../lib/api/client';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface FieldProps {
  id: string;
  label: string;
  icon: ReactNode;
  invalid: boolean;
  delay: number;
  trailing?: ReactNode;
  input: React.InputHTMLAttributes<HTMLInputElement>;
}

/** Login field: icon + input in one rounded control; the whole control lights up on focus. */
function Field({ id, label, icon, invalid, delay, trailing, input }: FieldProps) {
  return (
    <motion.div
      className="flex flex-col gap-1.5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: EASE }}
    >
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      <div
        className={[
          'group flex items-center gap-2 rounded-xl border bg-slate-50/70 px-3 transition-[border-color,box-shadow,background-color] duration-200',
          'focus-within:bg-white focus-within:border-[#E40043] focus-within:shadow-[0_0_0_4px_rgb(228_0_67/0.14)]',
          invalid ? 'border-red-300' : 'border-slate-200 hover:border-slate-300',
        ].join(' ')}
      >
        <span className="shrink-0 text-slate-400 transition-colors duration-200 group-focus-within:text-[#E40043]">{icon}</span>
        <input
          id={id}
          className="flex-1 min-w-0 bg-transparent py-3 text-base md:text-sm text-slate-900 placeholder:text-slate-400 outline-none"
          aria-invalid={invalid || undefined}
          {...input}
        />
        {trailing}
      </div>
    </motion.div>
  );
}

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // UI only: show/hide password, and a counter so the card shakes on every failed attempt.
  const [showPassword, setShowPassword] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const shake = useAnimationControls();

  // If we just got force-redirected here after a 401 elsewhere in the app, show the real
  // reason instead of letting it disappear silently (see lib/api/client.ts).
  useEffect(() => {
    const sessionError = consumeSessionError();
    if (sessionError) setError(sessionError.detail);
  }, []);

  useEffect(() => {
    if (error && attempt > 0) {
      shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.4, ease: 'easeInOut' } });
    }
  }, [error, attempt, shake]);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAttempt(a => a + 1);
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please enter your username and password.');
      return;
    }
    setIsLoading(true);
    try {
      await login(username.trim(), password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Invalid credentials. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const invalid = Boolean(error);

  return (
    <motion.form onSubmit={handleSubmit} className="flex flex-col gap-4" animate={shake} noValidate>
      <AnimatePresence initial={false}>
        {error && (
          <motion.div
            key="login-error"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Field
        id="login-username"
        label="Username or Mobile Number"
        icon={<User size={18} />}
        invalid={invalid && !username.trim()}
        delay={0.35}
        input={{
          type: 'text',
          value: username,
          onChange: e => setUsername(e.target.value),
          placeholder: 'Enter your username',
          autoComplete: 'username',
          autoCapitalize: 'none',
          spellCheck: false,
        }}
      />

      <Field
        id="login-password"
        label="Password"
        icon={<Lock size={18} />}
        invalid={invalid}
        delay={0.42}
        input={{
          type: showPassword ? 'text' : 'password',
          value: password,
          onChange: e => setPassword(e.target.value),
          placeholder: 'Enter your password',
          autoComplete: 'current-password',
        }}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword(s => !s)}
            className="-mr-2 shrink-0 w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={showPassword ? 'hide' : 'show'}
                className="flex"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.12 }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </motion.span>
            </AnimatePresence>
          </button>
        }
      />

      <motion.button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading || undefined}
        className="relative mt-2 w-full overflow-hidden rounded-xl bg-gradient-to-b from-[#E60E4E] to-[#D6003F] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgb(228_0_67/0.8),inset_0_1px_0_rgb(255_255_255/0.18)] transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-80"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.5, ease: EASE }}
        whileTap={isLoading ? undefined : { scale: 0.98 }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isLoading ? (
            <motion.span
              key="loading"
              className="flex items-center justify-center gap-2"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              <span className="inline-block w-4 h-4 border-2 border-white/90 border-t-transparent rounded-full animate-spin" />
              Signing in…
            </motion.span>
          ) : (
            <motion.span
              key="idle"
              className="flex items-center justify-center"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              Sign In
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.form>
  );
}
