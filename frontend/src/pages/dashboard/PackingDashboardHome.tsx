import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { ShoppingBag, PackageOpen, PackageCheck, ArrowRight } from 'lucide-react';
import { dashboardsApi } from '../../lib/api/insights';
import { useDashboardData, ErrorBanner, EmptyNote, ListSkeleton } from './dashboardKit';
import { STAGGER_CHILDREN } from '../pageKit';

export function PackingDashboardHome() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.packing(), []);

  // Group the per-variant rows by design for the "design-wise stock" list.
  const byDesign = new Map<string, { label: string; onHand: number; pending: number }>();
  for (const r of data?.designWiseStock ?? []) {
    const e = byDesign.get(r.designNo) ?? { label: `${r.designNo} — ${r.designName}`, onHand: 0, pending: 0 };
    e.onHand += r.onHand;
    e.pending += r.pendingQty;
    byDesign.set(r.designNo, e);
  }
  const designs = Array.from(byDesign.values()).sort((a, b) => b.onHand - a.onHand);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Packing Dashboard</h1>
          <p className="text-muted">Track ready stock, packing progress, and design-wise stock.</p>
        </div>
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => navigate('/ready-stock/packing')}>
          Go to Packing Worklist <ArrowRight size={16} />
        </Button>
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard title="Ready Stock" value={data ? `${data.readyStockTotal.toLocaleString('en-IN')} pcs` : '—'} icon={<ShoppingBag size={20} />} isLoading={isLoading} onClick={() => navigate('/ready-stock')} />
        <KPICard title="Pending Packing" value={data ? `${data.pendingPackingTotal.toLocaleString('en-IN')} pcs` : '—'} icon={<PackageOpen size={20} />} isLoading={isLoading} onClick={() => navigate('/ready-stock/packing')} />
        <KPICard
          title="Packed Quantity"
          value={data ? `${data.packedQtyTotal.toLocaleString('en-IN')} pcs` : '—'}
          icon={<PackageCheck size={20} />}
          isLoading={isLoading}
          trend={data && data.readyStockTotal > 0 ? { value: `${Math.round((data.packedQtyTotal / data.readyStockTotal) * 100)}%`, isPositive: true, label: 'of ready stock packed' } : undefined}
        />
      </div>

      <Card className="min-h-[300px]">
        <CardHeader title="Design-wise Stock" />
        {isLoading ? <ListSkeleton rows={4} /> : designs.length === 0 ? (
          <EmptyNote>No ready stock on hand.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {designs.map((d, idx) => (
              <div key={d.label} className="flex justify-between items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-0">
                <p className="text-sm font-medium min-w-0 break-words">{idx + 1}. {d.label}</p>
                <p className="text-sm font-semibold shrink-0 whitespace-nowrap">
                  {d.onHand.toLocaleString('en-IN')} pcs{d.pending > 0 && <span className="text-xs text-amber-600 font-normal"> · {d.pending} to pack</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
