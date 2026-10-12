import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, ChevronRight, Search, X } from 'lucide-react';

export interface PickerItem {
  id: string;
  /** Main line, e.g. "Cotton Cambric - Blue". */
  title: string;
  /** Second line, e.g. "Lot MAH-3 · from Mahesh Textiles". */
  subtitle?: string;
  /** Right-aligned, e.g. "75 m". */
  meta?: string;
  /** Small chip, e.g. "DUPATTA". */
  badge?: string;
  /** Greyed out and not selectable (with the reason in subtitle). */
  disabled?: boolean;
  /** Extra words to match when searching (codes, phone numbers...). */
  keywords?: string;
}

interface PickerSheetProps {
  open: boolean;
  title: string;
  items: PickerItem[];
  selectedId?: string;
  onSelect: (item: PickerItem) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  emptyText?: string;
  /** e.g. an "+ Add new material" button, shown under the list. */
  footer?: ReactNode;
  loading?: boolean;
  /**
   * Lets the user create a new record from this page (e.g. "Add supplier"). Called with what was
   * typed in the search box so the add form can be pre-filled. `createLabel` names the thing.
   */
  onCreate?: (query: string) => void;
  createLabel?: string;
}

const MAX_SHOWN = 150;
const norm = (s: string) => s.toLowerCase().normalize('NFKD');

/**
 * Full-screen search page for choosing from long lists (materials, lots, designs, karigars ...)
 * - far easier on a phone than a native dropdown with thousands of options. Every word typed must
 * match (in any order). Shows the first 150 matches; typing narrows it down.
 */
export function PickerSheet({
  open, title, items, selectedId, onSelect, onClose, searchPlaceholder = 'Search…', emptyText = 'Nothing found.', footer, loading, onCreate, createLabel = 'new',
}: PickerSheetProps) {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    const t = window.setTimeout(() => inputRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.clearTimeout(t); window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const matches = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter(it => {
      const hay = norm(`${it.title} ${it.subtitle ?? ''} ${it.meta ?? ''} ${it.badge ?? ''} ${it.keywords ?? ''}`);
      return words.every(w => hay.includes(w));
    });
  }, [items, q]);
  const shown = matches.slice(0, MAX_SHOWN);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex md:items-center md:justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <div className="absolute inset-0 bg-black/40 hidden md:block" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative flex flex-col w-full h-full md:h-[80vh] md:max-w-lg md:rounded-2xl bg-white shadow-2xl overflow-hidden"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
          >
            <div className="shrink-0 border-b border-[var(--color-border)] bg-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
              <div className="flex items-center gap-2 px-2 h-14">
                <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Back">
                  <ArrowLeft size={22} className="md:hidden" />
                  <X size={20} className="hidden md:block" />
                </button>
                <h2 className="font-semibold text-base truncate">{title}</h2>
              </div>
              <div className="px-3 pb-3">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="search"
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="input-field pl-10 pr-10"
                    enterKeyHint="search"
                    autoComplete="off"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const first = shown.find(s => !s.disabled);
                        if (first) onSelect(first);
                      }
                    }}
                  />
                  {q && (
                    <button type="button" onClick={() => { setQ(''); inputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-slate-400" aria-label="Clear search">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-muted mt-1.5">
                  {loading ? 'Loading…' : `${matches.length.toLocaleString('en-IN')} ${matches.length === 1 ? 'match' : 'matches'}${matches.length > MAX_SHOWN ? ` · showing first ${MAX_SHOWN}, type to narrow down` : ''}`}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}</div>
              ) : shown.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 px-6">
                  <p className="text-center text-sm text-muted">{emptyText}</p>
                  {onCreate && (
                    <button type="button" onClick={() => onCreate(q.trim())} className="pressable min-h-11 px-4 rounded-lg bg-[var(--color-primary)] text-white font-semibold text-sm">
                      + Add {q.trim() ? `“${q.trim()}”` : createLabel}
                    </button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--color-border)]">
                  {shown.map(it => {
                    const active = it.id === selectedId;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          disabled={it.disabled}
                          onClick={() => onSelect(it)}
                          className={`w-full text-left flex items-center gap-3 px-4 min-h-14 py-2.5 transition-colors ${it.disabled ? 'opacity-50' : 'active:bg-slate-100 hover:bg-slate-50'} ${active ? 'bg-[#FFF0F3]' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-slate-900 truncate">{it.title}</span>
                              {it.badge && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5 bg-[#FFF0F3] text-[#B80037] border border-[#FFB8CA]">{it.badge}</span>}
                            </div>
                            {it.subtitle && <p className="text-xs text-muted truncate mt-0.5">{it.subtitle}</p>}
                          </div>
                          {it.meta && <span className="shrink-0 text-sm font-semibold tabular text-slate-700">{it.meta}</span>}
                          {active ? <Check size={18} className="shrink-0 text-[#E40043]" /> : <ChevronRight size={18} className="shrink-0 text-slate-300" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {(footer || onCreate) && (
              <div className="shrink-0 border-t border-[var(--color-border)] p-3 bg-white flex flex-col gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                {footer}
                {onCreate && (
                  <button type="button" onClick={() => onCreate(q.trim())} className="pressable w-full min-h-11 rounded-lg border border-dashed border-[var(--color-primary)] text-[var(--color-primary)] font-semibold text-sm">
                    + Add {createLabel}{q.trim() ? ` “${q.trim()}”` : ''}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

interface PickerFieldProps {
  label?: ReactNode;
  /** Text shown when something is chosen. */
  value?: string;
  /** Second line under the value. */
  hint?: string;
  placeholder?: string;
  onOpen: () => void;
  disabled?: boolean;
  className?: string;
}

/** Looks like an input; tapping it opens a PickerSheet. */
export function PickerField({ label, value, hint, placeholder = 'Tap to choose', onOpen, disabled, className = '' }: PickerFieldProps) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      {label && <span className="text-sm font-medium">{label}</span>}
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        className="input-field pressable text-left flex items-center gap-2 min-h-11 disabled:opacity-60"
      >
        <span className="flex-1 min-w-0">
          <span className={`block truncate ${value ? 'text-slate-900' : 'text-slate-400'}`}>{value || placeholder}</span>
          {value && hint && <span className="block text-xs text-muted truncate">{hint}</span>}
        </span>
        <Search size={16} className="shrink-0 text-slate-400" />
      </button>
    </div>
  );
}
