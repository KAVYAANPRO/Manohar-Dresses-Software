import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Calendar, AlertTriangle, Inbox } from 'lucide-react';
import { motion } from 'framer-motion';
import { Collapse, spring } from '../../components/motion';
import { apiErrorMessage, type RangeParams, type AlertItem } from '../../lib/api/insights';

export type RangeKey = 'weekly' | 'monthly' | 'yearly' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
  { key: 'custom', label: 'Custom' },
];

const DAY = 86_400_000;
function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const todayISO = () => iso(new Date());
export const daysAgoISO = (n: number) => iso(new Date(Date.now() - n * DAY));

export const TREND_LABEL: Record<RangeKey, string> = {
  weekly: 'vs previous week',
  monthly: 'vs previous 30 days',
  yearly: 'vs previous year',
  custom: 'vs previous period',
};

export const PERIOD_LABEL: Record<RangeKey, string> = {
  weekly: 'last 7 days',
  monthly: 'last 30 days',
  yearly: 'last 12 months',
  custom: 'selected range',
};

/** Date range state shared by the dashboards: preset buttons + custom from/to. */
export function useRange(initial: RangeKey = 'monthly') {
  const [range, setRange] = useState<RangeKey>(initial);
  const [customFrom, setCustomFrom] = useState(daysAgoISO(29));
  const [customTo, setCustomTo] = useState(todayISO());
  const params: RangeParams =
    range === 'weekly' ? { from: daysAgoISO(6), to: todayISO() }
    : range === 'monthly' ? { from: daysAgoISO(29), to: todayISO() }
    : range === 'yearly' ? { from: daysAgoISO(364), to: todayISO() }
    : { from: customFrom, to: customTo };
  return { range, setRange, customFrom, setCustomFrom, customTo, setCustomTo, params, key: `${params.from}:${params.to}` };
}

export function RangeFilter({ state }: { state: ReturnType<typeof useRange> }) {
  const { range, setRange, customFrom, setCustomFrom, customTo, setCustomTo } = state;
  return (
    <div className="flex flex-col items-stretch sm:items-end gap-2 min-w-0">
      <div className="flex items-center gap-1 overflow-x-auto bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg p-1">
        {RANGE_OPTIONS.map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setRange(opt.key)}
            className={`relative flex-1 sm:flex-none whitespace-nowrap px-3 min-h-[40px] sm:min-h-0 py-2 sm:py-1.5 rounded-md text-sm font-medium transition-colors pressable ${
              range === opt.key ? 'text-white' : 'text-muted hover:bg-[var(--color-border)]/50'
            }`}
          >
            {range === opt.key && <motion.span layoutId="dash-range-pill" transition={spring.snappy} className="absolute inset-0 rounded-md bg-primary" />}
            <span className="relative">{opt.label}</span>
          </button>
        ))}
      </div>
      <Collapse open={range === 'custom'}>
        <div className="flex flex-wrap items-center gap-2 text-sm pt-0.5">
          <Calendar size={14} className="text-muted shrink-0" />
          <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
            className="input-field !py-1 !px-2 text-sm flex-1 min-w-0 sm:flex-none" />
          <span className="text-muted">to</span>
          <input type="date" value={customTo} min={customFrom} max={todayISO()} onChange={e => setCustomTo(e.target.value)}
            className="input-field !py-1 !px-2 text-sm flex-1 min-w-0 sm:flex-none" />
        </div>
      </Collapse>
    </div>
  );
}

/** Loads a dashboard payload; re-fetches when `deps` change. */
export function useDashboardData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    load()
      .then(d => { if (active) setData(d); })
      .catch(err => { if (active) setError(apiErrorMessage(err, 'Could not load the dashboard.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, isLoading, error };
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700 flex items-start gap-2">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{message}</span>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="py-8 flex flex-col items-center gap-2 text-center text-sm text-muted animate-fade-in">
      <span className="w-10 h-10 rounded-full bg-[#FFF0F3] text-[#E40043] flex items-center justify-center"><Inbox size={18} /></span>
      <p className="max-w-xs">{children}</p>
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 mt-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-12 w-full"></div>
      ))}
    </div>
  );
}

export function trendOf(pct: number | null | undefined, label: string) {
  if (pct === null || pct === undefined) return undefined;
  return { value: `${Math.abs(pct)}%`, isPositive: pct >= 0, label };
}

const SEVERITY_CLS: Record<string, { box: string; title: string; text: string }> = {
  critical: { box: 'bg-red-50 border-red-100', title: 'text-red-800', text: 'text-red-600' },
  warning: { box: 'bg-yellow-50 border-yellow-100', title: 'text-yellow-800', text: 'text-yellow-700' },
  info: { box: 'bg-slate-50 border-slate-200', title: 'text-slate-800', text: 'text-slate-600' },
};

/** One alert card (low stock, shortage, ...). `action` is an optional button label that opens the alert's link. */
export function AlertRow({ alert, action, onOpen }: { alert: AlertItem; action?: string; onOpen?: (link: string) => void }) {
  const cls = SEVERITY_CLS[alert.severity] ?? SEVERITY_CLS.info;
  return (
    <div className={`${cls.box} border p-3 rounded-lg animate-fade-up flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center`}>
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${cls.title}`}>{alert.title}</p>
        <p className={`text-xs ${cls.text} break-words`}>{alert.message}</p>
      </div>
      {action && alert.link && onOpen && (
        <button
          type="button"
          onClick={() => onOpen(alert.link!)}
          className="w-full sm:w-auto shrink-0 px-3 py-2 sm:py-1.5 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          {action}
        </button>
      )}
    </div>
  );
}
