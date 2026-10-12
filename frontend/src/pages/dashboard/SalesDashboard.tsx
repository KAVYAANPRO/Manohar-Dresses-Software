import { useNavigate } from 'react-router-dom';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { ShoppingCart, Users, ShoppingBag, CreditCard, IndianRupee } from 'lucide-react';
import { dashboardsApi, fmtDate } from '../../lib/api/insights';
import { formatINR } from '../../lib/format/money';
import { RestrictedValue } from '../../lib/permissions/Can';
import { RangeFilter, useRange, useDashboardData, ErrorBanner, EmptyNote, ListSkeleton, trendOf, TREND_LABEL, PERIOD_LABEL } from './dashboardKit';
import { SmartInsightsPanel } from './SmartInsightsPanel';
import { STAGGER_CHILDREN } from '../pageKit';
import { FadeIn } from '../../components/motion';

const PAY_CLS: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  UNPAID: 'bg-red-100 text-red-700',
};

export function SalesDashboard() {
  const navigate = useNavigate();
  const range = useRange('monthly');
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.sales(range.params), [range.key]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Sales Dashboard</h1>
          <p className="text-muted">Track sales orders, customers, billing and pending payments.</p>
        </div>
        <RangeFilter state={range} />
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard title="Open Sales Orders" value={data ? data.salesOrdersOpen : '—'} icon={<ShoppingCart size={20} />} isLoading={isLoading} onClick={() => navigate('/sales/orders')} />
        <KPICard
          title={`Billing (${PERIOD_LABEL[range.range]})`}
          value={data ? formatINR(data.billing) : '—'}
          icon={<IndianRupee size={20} />}
          isLoading={isLoading}
          trend={trendOf(data?.billingTrendPct, TREND_LABEL[range.range])}
          onClick={() => navigate('/sales/invoices')}
        />
        <KPICard title="Active Customers" value={data ? data.customers : '—'} icon={<Users size={20} />} isLoading={isLoading} onClick={() => navigate('/masters/customers')} />
        <KPICard title="Available Ready Stock" value={data ? `${data.availableReadyStock.toLocaleString('en-IN')} pcs` : '—'} icon={<ShoppingBag size={20} />} isLoading={isLoading} onClick={() => navigate('/ready-stock')} />
        {data?.pendingPaymentsTotal !== undefined && (
          <KPICard
            title="Pending Payments"
            value={formatINR(data.pendingPaymentsTotal)}
            icon={<CreditCard size={20} />}
            isLoading={isLoading}
            trend={{ value: String(data.pendingPaymentsCount ?? 0), isPositive: false, label: 'unpaid invoices' }}
            onClick={() => navigate('/sales/payments')}
          />
        )}
      </div>

      <SmartInsightsPanel />

      <FadeIn delay={0.12} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="min-h-[300px]">
          <CardHeader title="Recent Sales" />
          {isLoading ? <ListSkeleton rows={4} /> : !data || data.recentSales.length === 0 ? (
            <EmptyNote>No confirmed invoices yet.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.recentSales.map(s => (
                <button key={s.id} type="button" onClick={() => navigate(`/sales/invoices/${s.id}`)}
                  className="text-left flex justify-between items-center gap-3 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{s.docNo} · {s.customerName}</p>
                    <p className="text-xs text-muted flex flex-wrap items-center gap-1">
                      {fmtDate(s.docDate)} · {s.qty} pcs
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${PAY_CLS[s.paymentStatus] ?? 'bg-slate-100 text-slate-600'}`}>{s.paymentStatus}</span>
                    </p>
                  </div>
                  <p className="text-sm font-semibold shrink-0 whitespace-nowrap">
                    <RestrictedValue perm="invoices.rate.view">{formatINR(s.grandTotal)}</RestrictedValue>
                  </p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-h-[300px]">
          <CardHeader title="Open Sales Orders" />
          {isLoading ? <ListSkeleton rows={4} /> : !data || data.openSalesOrders.length === 0 ? (
            <EmptyNote>No open sales orders.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.openSalesOrders.map(o => (
                <button key={o.id} type="button" onClick={() => navigate(`/sales/orders/${o.id}`)}
                  className="text-left flex justify-between items-center gap-3 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{o.docNo ?? 'Draft'} · {o.customerName}</p>
                    <p className="text-xs text-muted">{o.status.replace(/_/g, ' ').toLowerCase()}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0 whitespace-nowrap">{o.qtyInvoiced}/{o.qty} pcs invoiced</p>
                </button>
              ))}
            </div>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
