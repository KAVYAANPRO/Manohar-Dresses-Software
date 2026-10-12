import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE_OUT } from './motionTokens';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

/** A <select> replacement with a filter box — for any list long enough that scrolling through it is annoying. */
export function SearchableSelect({ value, onChange, options, placeholder = 'Select...', required, className = '' }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value);
  const filtered = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="input-field w-full flex items-center justify-between text-left"
      >
        <span className={`min-w-0 truncate ${selected ? '' : 'text-slate-400'}`}>{selected?.label ?? placeholder}</span>
        <span className="flex items-center gap-1 shrink-0">
          {selected && (
            <X size={14} className="text-slate-300 hover:text-slate-500 transition-colors" onClick={e => { e.stopPropagation(); onChange(''); }} />
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {required && !value && <input tabIndex={-1} value="" required onChange={() => {}} className="absolute inset-0 opacity-0 pointer-events-none" />}

      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
          exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12 } }}
          style={{ transformOrigin: 'top center' }}
          className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-overlay max-h-64 overflow-hidden flex flex-col"
        >
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-100">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full text-base md:text-sm outline-none py-1"
            />
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-slate-400">No matches.</div>
            ) : filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2.5 md:py-2 text-sm transition-colors hover:bg-[#FFF0F3] active:bg-[#FFDCE5] ${o.value === value ? 'bg-[#FFF0F3] text-[#B80037] font-medium' : 'text-slate-700'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
