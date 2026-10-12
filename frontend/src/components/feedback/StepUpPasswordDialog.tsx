import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { apiClient } from '../../lib/api/client';
import { useAuth } from '../../lib/auth/AuthContext';
import { ModalShell } from './ModalShell';

interface StepUpPasswordDialogProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Re-verifies the CURRENTLY logged-in admin's own password before a sensitive action (granting
 * Super Admin, or granting a user visibility into pricing/amounts) takes effect. Verifies by
 * replaying it through the real POST /api/v1/auth/login for this session's own username — a
 * genuine check against the backend, not a client-side gate.
 */
export function StepUpPasswordDialog({ open, title, message, onConfirm, onCancel }: StepUpPasswordDialogProps) {
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleConfirm = async () => {
    if (!password) { setError('Enter your password to confirm.'); return; }
    setVerifying(true);
    setError('');
    try {
      await apiClient.post('/auth/login', { usernameOrMobile: user?.name, password });
      setPassword('');
      onConfirm();
    } catch {
      setError('Incorrect password.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onCancel} className="md:rounded-2xl w-full max-w-sm p-4 sm:p-6">
        <div className="flex items-start justify-between mb-3">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} className="text-[#E40043]" /> {title}
          </h3>
          <button onClick={onCancel} className="shrink-0 -mr-2 -mt-2 flex items-center justify-center w-10 h-10 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-sm text-slate-600 mb-4">{message}</p>

        <label className="block text-xs font-medium text-slate-600 mb-1">Confirm your password</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') handleConfirm(); }}
          className={`input-field mb-1 ${error ? 'input-error animate-shake' : ''}`}
        />
        {error && <p className="text-xs text-red-600 mb-2 animate-fade-in">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end mt-3">
          <button onClick={onCancel} className="pressable w-full sm:w-auto px-4 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={verifying}
            className="pressable w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 text-sm bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] font-medium disabled:opacity-60 transition-colors"
          >
            {verifying && <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {verifying ? 'Verifying…' : 'Confirm'}
          </button>
        </div>
    </ModalShell>
  );
}
