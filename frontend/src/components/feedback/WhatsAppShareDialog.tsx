import { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { openWhatsAppChat } from '../../lib/whatsapp/whatsapp';
import { ModalShell } from './ModalShell';

interface WhatsAppShareDialogProps {
  open: boolean;
  title: string;
  /** Pre-built message; the number can still be edited before sending. */
  message: string;
  /** Pre-fill with a known number (e.g. a karigar's or customer's saved mobile). */
  defaultNumber?: string;
  onClose: () => void;
}

/**
 * Opens WhatsApp with the number + message pre-filled (wa.me click-to-chat — works with no API
 * key, but the person still taps Send inside WhatsApp themselves; see lib/whatsapp/whatsapp.ts).
 */
export function WhatsAppShareDialog({ open, title, message, defaultNumber, onClose }: WhatsAppShareDialogProps) {
  const [number, setNumber] = useState(defaultNumber ?? '');

  useEffect(() => {
    if (open) setNumber(defaultNumber ?? '');
  }, [open, defaultNumber]);

  const digits = number.replace(/[^0-9]/g, '');
  const canSend = digits.length >= 10;

  return (
    <ModalShell open={open} onClose={onClose} className="md:rounded-2xl w-full max-w-md p-4 sm:p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2 min-w-0">
            <MessageCircle size={18} className="text-green-600" /> {title}
          </h3>
          <button onClick={onClose} className="shrink-0 -mr-2 -mt-2 flex items-center justify-center w-10 h-10 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Close"><X size={18} /></button>
        </div>

        <label className="block text-xs font-medium text-slate-600 mb-1">WhatsApp Number</label>
        <input
          type="tel"
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="e.g. 9876500001"
          autoFocus
          className="w-full px-3 py-2.5 md:py-2 text-base md:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-4 focus:ring-green-500/15 focus:border-green-500 transition-[border-color,box-shadow] mb-3"
        />

        <label className="block text-xs font-medium text-slate-600 mb-1">Message Preview</label>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap max-h-40 overflow-y-auto mb-4">
          {message}
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 sm:justify-end">
          <button onClick={onClose} className="pressable w-full sm:w-auto px-4 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            disabled={!canSend}
            onClick={() => { openWhatsAppChat(number, message); onClose(); }}
            className="pressable w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 text-sm transition-colors bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
          >
            <MessageCircle size={15} /> Open in WhatsApp
          </button>
        </div>
    </ModalShell>
  );
}
