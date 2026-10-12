import { useNavigate } from 'react-router-dom';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Package, ShoppingBag, Factory, Activity, AlertTriangle, TrendingUp, CreditCard, Clock, IndianRupee } from 'lucide-react';
import { SmartInsightsPanel } from './SmartInsightsPanel';
import { dashboardsApi, fmtUnits, timeAgo } from '../../lib/api/insights';
import { formatINR } from '../../lib/format/money';
import {
  RangeFilter, useRange, useDashboardData, ErrorBanner, EmptyNote, ListSkeleton, AlertRow, trendOf, TREND_LABEL, PERIOD_LABEL,
} from './dashboardKit';
import { STAGGER_CHILDREN } from '../pageKit';
import { FadeIn } from '../../components/motion';

const ACTIVITY_DOT: Record<string, string> = {
  confirmed: 'bg-[var(--color-success)]',
  created: 'bg-[var(--color-primary)]',
  cancelled: 'bg-[var(--color-error)]',
};

const ENTITY_LABEL: Record<string, string> = {
  Purchase: 'Purchase', Inward: 'Inward', JobSlip: 'Job slip', MaterialIssue: 'Material issue', JobReceipt: 'Finished goods receipt',
  Invoice: 'Invoice', SalesOrder: 'Sales order', Payment: 'Payment', StockAdjustment: 'Stock adjustment',
};

export function AdminDashboard() {
  const navigate = useNavigate();
  const range = useRange('monthly');
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.admin(range.params), [range.key]);
  const trendLabel = TREND_LABEL[range.range];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end sm:flex-wrap sm:gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Overview</h1>
          <p className="text-muted">Stock is as of now; production and sales cover the {PERIOD_LABEL[range.range]}.</p>
        </div>
        <RangeFilter state={range} />
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard
          title="Total Raw Stock"
          value={data ? fmtUnits(data.rawStockByUnit) : '—'}
          icon={<Package size={20} />}
          isLoading={isLoading}
          trend={data ? { value: formatINR(data.totalRawStockValue), isPositive: true, label: 'stock value' } : undefined}
          onClick={() => navigate('/inventory/stock')}
        />
        <KPICard
          title="Total Ready Stock"
          value={data ? `${data.totalReadyStock.toLocaleString('en-IN')} pcs` : '—'}
          icon={<ShoppingBag size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/ready-stock')}
        />
        <KPICard
          title="Material with Factories"
          value={data ? fmtUnits(data.materialWithFactoriesByUnit) : '—'}
          icon={<Factory size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/production/issuance')}
        />
        <KPICard
          title="Jobs in Progress"
          value={data ? data.jobsInProgress : '—'}
          icon={<Activity size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/production/job-slips')}
        />
        <KPICard
          title="Pending Jobs (not issued)"
          value={data ? data.pendingJobs : '—'}
          icon={<Clock size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/production/job-slips')}
        />
        <KPICard
          title="Production Completed"
          value={data ? `${data.productionCompleted.toLocaleString('en-IN')} pcs` : '—'}
          icon={<TrendingUp size={20} />}
          isLoading={isLoading}
          trend={trendOf(data?.productionCompletedTrendPct, trendLabel)}
          onClick={() => navigate('/production/receiving')}
        />
        <KPICard
          title="Sales"
          value={data ? formatINR(data.sales) : '—'}
          icon={<IndianRupee size={20} />}
          isLoading={isLoading}
          trend={trendOf(data?.salesTrendPct, trendLabel)}
          onClick={() => navigate('/sales/invoices')}
        />
        <KPICard
          title="Pending Payments"
          value={data ? formatINR(data.pendingPaymentsTotal) : '—'}
          icon={<CreditCard size={20} />}
          isLoading={isLoading}
          trend={data && data.overduePaymentsCount > 0 ? { value: formatINR(data.overduePaymentsTotal), isPositive: false, label: `overdue (${data.overduePaymentsCount})` } : undefined}
          onClick={() => navigate('/sales/payments')}
        />
        <KPICard
          title="Open Alerts"
          value={data ? data.alertsCount : '—'}
          icon={<AlertTriangle size={20} className="text-[var(--color-error)]" />}
          isLoading={isLoading}
          trend={data ? { value: `${data.lowStockCount} low stock`, isPositive: data.lowStockCount === 0, label: `${data.shortageCount} high shortage` } : undefined}
          onClick={() => navigate('/inventory/stock')}
        />
      </div>

      <SmartInsightsPanel />

      <FadeIn delay={0.12} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="min-h-[300px]">
          <CardHeader title="Recent Activity" />
          {isLoading ? <ListSkeleton rows={4} /> : !data || data.recentActivity.length === 0 ? (
            <EmptyNote>No business activity recorded yet.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-4">
              {data.recentActivity.map(a => (
                <div key={`${a.entityId}-${a.action}-${a.at}`} className="flex gap-4 border-b border-[var(--color-border)] pb-3 last:border-0">
                  <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${ACTIVITY_DOT[a.action] ?? 'bg-[var(--color-warning)]'}`}></div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{ENTITY_LABEL[a.entityType] ?? a.entityType} {a.action}</p>
                    <p className="text-xs text-muted break-words">{a.ref} · by {a.by}</p>
                    <p className="text-xs text-muted mt-1">{timeAgo(a.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-h-[300px]">
          <CardHeader title="Shortage & Low Stock Alerts" />
          {isLoading ? <ListSkeleton /> : !data || (data.shortageSummary.length === 0 && data.lowStock.length === 0) ? (
            <EmptyNote>No shortage or low-stock alerts right now.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.shortageSummary.map(a => <AlertRow key={a.key} alert={a} action="Review" onOpen={navigate} />)}
              {data.lowStock.map(a => (
                <AlertRow
                  key={a.key}
                  alert={a}
                  action={a.type === 'LOW_RAW_STOCK' ? 'Purchase' : 'Plan Job'}
                  onOpen={() => navigate(a.type === 'LOW_RAW_STOCK' ? '/procurement/purchases/new' : '/production/job-slips/new')}
                />
              ))}
            </div>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
