import type { ReactNode } from 'react';
import { Card } from './Card';
import { Skeleton } from './Skeleton';
import { AnimatedNumber } from '../motion';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: string | number;
    isPositive: boolean;
    label: string;
  };
  isLoading?: boolean;
  /** When set, the whole card becomes a button that navigates to this route. */
  onClick?: () => void;
}

export function KPICard({ title, value, icon, trend, isLoading, onClick }: KPICardProps) {
  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4" aria-busy="true">
        <div className="flex justify-between items-start">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton circle className="h-10 w-10" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-3 w-1/4 mt-2" />
      </Card>
    );
  }

  return (
    <Card
      className={`flex flex-col gap-2 animate-fade-up${onClick ? ' cursor-pointer lift pressable hover:border-primary/40' : ''}`}
      {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } } : {})}
    >
      <div className="flex justify-between items-start gap-2 mb-2">
        <h4 className="text-xs md:text-sm font-medium text-[var(--color-text-muted)] min-w-0 break-words">{title}</h4>
        <div className="shrink-0 w-9 h-9 -mt-1 -mr-1 rounded-lg bg-[#FFF0F3] text-[#E40043] flex items-center justify-center">{icon}</div>
      </div>
      <div className="text-xl md:text-2xl font-bold tracking-tight text-[var(--color-text-main)] break-words tabular">
        <KPIValue value={value} />
      </div>

      {trend && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${trend.isPositive ? 'bg-emerald-50 text-[var(--color-success)]' : 'bg-red-50 text-[var(--color-error)]'}`}>
            {trend.isPositive ? '↑' : '↓'} {trend.value}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">{trend.label}</span>
        </div>
      )}
    </Card>
  );
}

/**
 * Counts up any single number, keeping the caller's formatting around it: 12, "323 pcs",
 * "₹ 1,70,012.96", "1,678 m". Values with no number (or several, e.g. "12 m · 4 kg") show as-is.
 */
function KPIValue({ value }: { value: string | number }) {
  if (typeof value === 'number') {
    const decimals = Number.isInteger(value) ? 0 : 2;
    return <AnimatedNumber value={value} format={n => n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} />;
  }
  const m = /^(\D*?)(-?\d[\d,]*(?:\.\d+)?)(\D*)$/.exec(value);
  if (!m) return <>{value}</>;
  const [, prefix, numText, suffix] = m;
  const n = Number(numText.replace(/,/g, ''));
  if (!Number.isFinite(n)) return <>{value}</>;
  const decimals = numText.includes('.') ? numText.split('.')[1].length : 0;
  return (
    <>
      {prefix}
      <AnimatedNumber value={n} format={x => x.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} />
      {suffix}
    </>
  );
}
