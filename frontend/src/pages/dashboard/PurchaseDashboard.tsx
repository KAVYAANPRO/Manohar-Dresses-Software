import { useNavigate } from 'react-router-dom';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { ShoppingCart, Truck, Package, IndianRupee } from 'lucide-react';
import { dashboardsApi, fmtDate, fmtUnits } from '../../lib/api/insights';
import { formatINR } from '../../lib/format/money';
import { RestrictedValue } from '../../lib/permissions/Can';
import { RangeFilter, useRange, useDashboardData, ErrorBanner, EmptyNote, ListSkeleton, trendOf, TREND_LABEL, PERIOD_LABEL } from './dashboardKit';
import { SmartInsightsPanel } from './SmartInsightsPanel';
import { STAGGER_CHILDREN } from '../pageKit';
import { FadeIn } from '../../components/motion';

export function PurchaseDashboard() {
  const navigate = useNavigate();
  const range = useRange('monthly');
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.purchase(range.params), [range.key]);
  const period = PERIOD_LABEL[range.range];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Purchase Dashboard</h1>
          <p className="text-muted">Manage supplier purchases and track pending inward.</p>
        </div>
        <RangeFilter state={range} />
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard
          title={`Purchases (${period})`}
          value={data ? (data.totalPurchases !== undefined ? formatINR(data.totalPurchases) : `${data.purchaseCount} POs`) : '—'}
          icon={<IndianRupee size={20} />}
          isLoading={isLoading}
          trend={data?.totalPurchases !== undefined ? trendOf(data.totalPurchasesTrendPct, TREND_LABEL[range.range]) : undefined}
          onClick={() => navigate('/procurement/purchases')}
        />
        <KPICard
          title="Pending Inward"
          value={data ? data.pendingInward : '—'}
          icon={<Truck size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/procurement/inward')}
        />
        <KPICard
          title={`Material Purchased (${period})`}
          value={data ? fmtUnits(data.materialPurchasedByUnit) : '—'}
          icon={<Package size={20} />}
          isLoading={isLoading}
        />
        <KPICard
          title="Open Purchase Orders"
          value={data ? data.openPurchaseOrders : '—'}
          icon={<ShoppingCart size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/procurement/purchases')}
        />
      </div>

      <SmartInsightsPanel />

      <FadeIn delay={0.12} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="min-h-[300px]">
          <CardHeader title="Recent Purchases" />
          {isLoading ? <ListSkeleton rows={4} /> : !data || data.recentPurchases.length === 0 ? (
            <EmptyNote>No purchases yet.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.recentPurchases.map(p => (
                <button key={p.id} type="button" onClick={() => navigate(`/procurement/purchases/${p.id}`)}
                  className="text-left flex justify-between items-center gap-3 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{p.docNo} · {p.supplierName}</p>
                    <p className="text-xs text-muted break-words">{p.material} · {fmtDate(p.docDate)} · {p.status.replace(/_/g, ' ').toLowerCase()}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0 whitespace-nowrap">
                    <RestrictedValue perm="purchases.rate.view">{p.amount !== undefined ? formatINR(p.amount) : ''}</RestrictedValue>
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-h-[300px]">
          <CardHeader title="Pending Inward" />
          {isLoading ? <ListSkeleton /> : !data || data.pendingInwardList.length === 0 ? (
            <EmptyNote>Nothing waiting to be received.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.pendingInwardList.map(p => (
                <div key={p.id} className="bg-yellow-50 border border-yellow-100 p-3 rounded-md flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-yellow-800 break-words">{p.docNo} · {p.supplierName}</p>
                    <p className="text-xs text-yellow-700 break-words">{p.material} · {p.outstandingQty.toLocaleString('en-IN')} outstanding · ordered {fmtDate(p.docDate)} ({p.ageDays} days)</p>
                  </div>
                  <button type="button" onClick={() => navigate('/procurement/inward/new')}
                    className="w-full sm:w-auto shrink-0 px-3 py-2 sm:py-1.5 text-sm font-medium rounded-lg border border-yellow-200 bg-white text-yellow-700">
                    Receive
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </FadeIn>

      <Card className="min-h-[200px]">
        <CardHeader title={`Supplier-wise Purchases (${period})`} />
        {isLoading ? <ListSkeleton rows={4} /> : !data || data.supplierWisePurchases.length === 0 ? (
          <EmptyNote>No purchases in this period.</EmptyNote>
        ) : (
          <div className="flex flex-col gap-2">
            {data.supplierWisePurchases.map((s, idx) => (
              <div key={s.supplierId} className="flex justify-between items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-0">
                <p className="text-sm font-medium min-w-0 break-words">{idx + 1}. {s.supplierName} <span className="text-xs text-muted">({s.count} PO{s.count > 1 ? 's' : ''})</span></p>
                <p className="text-sm font-semibold shrink-0 whitespace-nowrap">
                  <RestrictedValue perm="purchases.rate.view">{s.total !== undefined ? formatINR(s.total) : ''}</RestrictedValue>
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
