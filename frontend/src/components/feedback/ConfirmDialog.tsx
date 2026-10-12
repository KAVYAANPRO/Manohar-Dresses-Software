import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from './ModalShell';

interface ConfirmDialogProps {
  open: boolean;
  /** Short action title, e.g. "Confirm Invoice". */
  title: string;
  /**
   * The actual business impact, stated plainly (frontend.md §45):
   * "Confirm invoice and deduct 20 pieces from ready stock?" — never a bare
   * "Are you sure?".
   */
  impact: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  /** Disables the confirm button without affecting cancel — e.g. a required reason field is empty. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  impact,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  isLoading = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <ModalShell
      open={open}
      onClose={isLoading ? undefined : onCancel}
      ariaLabelledBy="confirm-dialog-title"
      className="md:rounded-2xl max-w-md w-full p-4 sm:p-6 flex flex-col gap-4"
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center animate-pop ${danger ? 'bg-red-100 text-red-600 ring-4 ring-red-50' : 'bg-[#FFDCE5] text-[#E40043] ring-4 ring-[#FFF0F3]'}`}>
          <AlertTriangle size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-slate-900">{title}</h2>
          <div className="text-sm text-slate-600 mt-1 break-words">{impact}</div>
        </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 mt-2">
        <Button variant="secondary" className="w-full sm:w-auto" onClick={onCancel} disabled={isLoading}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} className="w-full sm:w-auto" onClick={onConfirm} isLoading={isLoading} disabled={confirmDisabled}>{confirmLabel}</Button>
      </div>
    </ModalShell>
  );
}
