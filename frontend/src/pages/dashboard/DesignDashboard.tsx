import { useNavigate } from 'react-router-dom';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Shirt, Sparkles, Factory } from 'lucide-react';
import { dashboardsApi, type DesignRow } from '../../lib/api/insights';
import { RangeFilter, useRange, useDashboardData, ErrorBanner, EmptyNote, ListSkeleton, PERIOD_LABEL } from './dashboardKit';
import { SmartInsightsPanel } from './SmartInsightsPanel';
import { STAGGER_CHILDREN } from '../pageKit';
import { FadeIn } from '../../components/motion';

function DesignList({ rows, value, empty, onOpen }: { rows: DesignRow[]; value: (r: DesignRow) => string; empty: string; onOpen: (id: string) => void }) {
  if (rows.length === 0) return <EmptyNote>{empty}</EmptyNote>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map((d, idx) => (
        <button key={d.designId} type="button" onClick={() => onOpen(d.designId)}
          className="text-left flex justify-between items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-0">
          <p className="text-sm font-medium min-w-0 break-words">{idx + 1}. {d.designNo} — {d.name}</p>
          <p className="text-sm font-semibold shrink-0 whitespace-nowrap">{value(d)}</p>
        </button>
      ))}
    </div>
  );
}

export function DesignDashboard() {
  const navigate = useNavigate();
  const range = useRange('monthly');
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.design(range.params), [range.key]);
  const open = (id: string) => navigate(`/production/designs/${id}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Design Dashboard</h1>
          <p className="text-muted">Track designs, production and stock by design.</p>
        </div>
        <RangeFilter state={range} />
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard title="Total Designs" value={data ? data.totalDesigns : '—'} icon={<Shirt size={20} />} isLoading={isLoading} onClick={() => navigate('/production/designs')} />
        <KPICard
          title="Active Designs"
          value={data ? data.activeDesigns : '—'}
          icon={<Sparkles size={20} />}
          isLoading={isLoading}
          trend={data ? { value: String(data.newDesignsInRange), isPositive: true, label: `new in ${PERIOD_LABEL[range.range]}` } : undefined}
        />
        <KPICard title="Designs in Production" value={data ? data.designsInProduction : '—'} icon={<Factory size={20} />} isLoading={isLoading} onClick={() => navigate('/production/job-slips')} />
      </div>

      <SmartInsightsPanel />

      <FadeIn delay={0.12} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="min-h-[300px]">
          <CardHeader title="Design-wise Production (all time)" />
          {isLoading ? <ListSkeleton rows={4} /> : (
            <DesignList rows={(data?.designWiseProduction ?? []).filter(d => d.producedQty > 0)} value={d => `${d.producedQty.toLocaleString('en-IN')} pcs`} empty="No finished goods received yet." onOpen={open} />
          )}
        </Card>
        <Card className="min-h-[300px]">
          <CardHeader title="Design-wise Ready Stock" />
          {isLoading ? <ListSkeleton rows={4} /> : (
            <DesignList rows={(data?.designWiseStock ?? []).filter(d => d.onHand > 0)} value={d => `${d.onHand.toLocaleString('en-IN')} pcs`} empty="No ready stock on hand." onOpen={open} />
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
