/**
 * Page-level UI helpers shared by list/detail pages (layout + motion only, no data logic).
 *
 *   EmptyState    icon + one line + optional action, for hand-rolled lists
 *   MobileList    staggered container for phone card lists
 *   MobileCard    one tappable/static card inside <MobileList>
 *   FilterPills   segmented filter buttons with a sliding active pill
 *   StatTile      small summary tile; numbers count up
 */
import { useId } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatedNumber, FadeIn, Stagger, StaggerItem, spring } from '../components/motion';

export function EmptyState({
  message, icon: Icon = Inbox, action, className = '',
}: { message: ReactNode; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-dashed border-slate-200 rounded-xl px-4 py-10 flex flex-col items-center gap-2 text-center text-slate-500 text-sm animate-fade-in ${className}`}>
      <span className="w-11 h-11 rounded-full bg-[#FFF0F3] text-[#E40043] flex items-center justify-center"><Icon size={20} /></span>
      <div className="max-w-xs">{message}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Same as EmptyState but sized for a table <td colSpan>. */
export function EmptyRow({ colSpan, message, icon }: { colSpan: number; message: ReactNode; icon?: LucideIcon }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-4">
        <EmptyState message={message} icon={icon} className="border-0" />
      </td>
    </tr>
  );
}

/**
 * CSS-only stagger for direct children (fade-up, 35ms apart, first 12 only). Works on any
 * existing card markup, so hand-rolled lists don't need restructuring.
 */
export const STAGGER_CHILDREN = '[&>*]:animate-fade-up [&>*:nth-child(2)]:[animation-delay:35ms] [&>*:nth-child(3)]:[animation-delay:70ms] [&>*:nth-child(4)]:[animation-delay:105ms] [&>*:nth-child(5)]:[animation-delay:140ms] [&>*:nth-child(6)]:[animation-delay:175ms] [&>*:nth-child(7)]:[animation-delay:210ms] [&>*:nth-child(8)]:[animation-delay:245ms] [&>*:nth-child(9)]:[animation-delay:280ms] [&>*:nth-child(10)]:[animation-delay:315ms] [&>*:nth-child(11)]:[animation-delay:350ms] [&>*:nth-child(12)]:[animation-delay:385ms] [&>*:nth-child(n+13)]:[animation-delay:420ms]';

export function MobileList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN} ${className}`}>{children}</div>;
}

export function MobileCard({
  children, onClick, className = '',
}: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <div
      {...(onClick ? { role: 'button', tabIndex: 0, onClick, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') onClick(); } } : {})}
      className={`w-full text-left flex flex-col gap-2 p-4 bg-white border border-slate-200/80 rounded-xl shadow-card ${onClick ? 'pressable cursor-pointer active:bg-slate-50' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function FilterPills<T extends string>({
  options, value, onChange, label = (o: T) => o, className = '',
}: { options: readonly T[]; value: T; onChange: (v: T) => void; label?: (o: T) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1 ${className}`} role="tablist">
      {options.map(o => {
        const active = o === value;
        return (
          <button
            key={o}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o)}
            className={`relative shrink-0 whitespace-nowrap min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium transition-colors pressable ${
              active ? 'text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {active && (
              <motion.span layoutId={`pill-${id}`} transition={spring.snappy} className="absolute inset-0 rounded-lg bg-[#E40043]" />
            )}
            <span className="relative">{label(o)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Summary tile. Pass a number + `format` to get a count-up, or any node via `children`. */
export function StatTile({
  label, value, format, valueClass = 'text-slate-900', children,
}: { label: ReactNode; value?: number; format?: (n: number) => string; valueClass?: string; children?: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-card p-4 min-w-0">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-lg md:text-xl font-bold break-words tabular ${valueClass}`}>
        {children ?? (value !== undefined ? <AnimatedNumber value={value} format={format} /> : '—')}
      </div>
    </div>
  );
}

/** Grid wrapper that staggers its tiles. */
export function StatGrid({ children, className = 'grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4' }: { children: ReactNode; className?: string }) {
  return <Stagger className={className}>{children}</Stagger>;
}
export { StaggerItem as StatItem };

/**
 * Sliding underline for hand-rolled tab bars. Render inside the active tab button (which must be
 * `relative`). Give each tab bar its own `group` id.
 */
export function TabUnderline({ group }: { group: string }) {
  return <motion.span layoutId={`tab-underline-${group}`} transition={spring.snappy} className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#E40043]" />;
}

/** Sliding white pill for segmented tab bars on a grey track. */
export function TabPill({ group }: { group: string }) {
  return <motion.span layoutId={`tab-pill-${group}`} transition={spring.snappy} className="absolute inset-0 rounded-lg bg-white shadow-sm" />;
}

/** Re-runs a quick fade whenever `k` changes (tab panels). */
export function TabPanel({ k, children, className }: { k: string; children: ReactNode; className?: string }) {
  return <FadeIn key={k} y={6} duration={0.22} className={className}>{children}</FadeIn>;
}

/** Sliding teal fill for solid segmented buttons (active = white text on teal). */
export function TabFill({ group }: { group: string }) {
  return <motion.span layoutId={`tab-fill-${group}`} transition={spring.snappy} className="absolute inset-0 rounded-lg bg-[#E40043]" />;
}
