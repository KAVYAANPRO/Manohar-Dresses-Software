import { useNavigate } from 'react-router-dom';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Package, PackageMinus, Factory, CheckCircle2, AlertTriangle } from 'lucide-react';
import { dashboardsApi, fmtUnits } from '../../lib/api/insights';
import { formatINR } from '../../lib/format/money';
import { RangeFilter, useRange, useDashboardData, ErrorBanner, EmptyNote, ListSkeleton, AlertRow, PERIOD_LABEL } from './dashboardKit';
import { SmartInsightsPanel } from './SmartInsightsPanel';
import { STAGGER_CHILDREN } from '../pageKit';
import { FadeIn } from '../../components/motion';

export function RawMaterialDashboard() {
  const navigate = useNavigate();
  const range = useRange('monthly');
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.rawMaterial(range.params), [range.key]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Raw Material Dashboard</h1>
          <p className="text-muted">Track raw material stock, issues, and shortages.</p>
        </div>
        <RangeFilter state={range} />
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard
          title="Current Stock"
          value={data ? fmtUnits(data.currentStockByUnit) : '—'}
          icon={<Package size={20} />}
          isLoading={isLoading}
          trend={data?.currentRawStockValue !== undefined ? { value: formatINR(data.currentRawStockValue), isPositive: true, label: 'stock value' } : undefined}
          onClick={() => navigate('/inventory/stock')}
        />
        <KPICard
          title={`Material Issued (${PERIOD_LABEL[range.range]})`}
          value={data ? fmtUnits(data.materialIssuedByUnit) : '—'}
          icon={<PackageMinus size={20} />}
          isLoading={isLoading}
          onClick={() => navigate('/production/issuance')}
        />
        <KPICard
          title="Material with Factories"
          value={data ? fmtUnits(data.materialWithFactoriesByUnit) : '—'}
          icon={<Factory size={20} />}
          isLoading={isLoading}
        />
        <KPICard
          title="Processed Material"
          value={data ? fmtUnits(data.processedMaterialByUnit) : '—'}
          icon={<CheckCircle2 size={20} />}
          isLoading={isLoading}
        />
        <KPICard
          title="Highest Shortage"
          value={data ? `${data.maxShortagePct}%` : '—'}
          icon={<AlertTriangle size={20} className="text-[var(--color-error)]" />}
          isLoading={isLoading}
          trend={data ? {
            value: `${data.shortageAlerts.length} job${data.shortageAlerts.length === 1 ? '' : 's'}`,
            isPositive: data.shortageAlerts.length === 0,
            label: data.shortageTolerancePct > 0 ? `over ${data.shortageTolerancePct}% tolerance` : 'set a tolerance in Settings',
          } : undefined}
        />
        <KPICard
          title="Low Stock Items"
          value={data ? data.lowStockCount : '—'}
          icon={<AlertTriangle size={20} className="text-[var(--color-warning)]" />}
          isLoading={isLoading}
        />
      </div>

      <SmartInsightsPanel />

      <FadeIn delay={0.12} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="min-h-[300px]">
          <CardHeader title="Shortage Alerts" />
          {isLoading ? <ListSkeleton /> : !data || data.shortageAlerts.length === 0 ? (
            <EmptyNote>{data && data.shortageTolerancePct === 0 ? 'No shortage tolerance set — configure it in Settings to get alerts.' : 'No job is over the shortage tolerance.'}</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.shortageAlerts.map(a => <AlertRow key={a.key} alert={a} action="Review" onOpen={navigate} />)}
            </div>
          )}
        </Card>

        <Card className="min-h-[300px]">
          <CardHeader title="Low Stock Alerts" />
          {isLoading ? <ListSkeleton /> : !data || data.lowStock.length === 0 ? (
            <EmptyNote>All materials with a minimum level are above it.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.lowStock.map(a => <AlertRow key={a.key} alert={a} action="Purchase" onOpen={() => navigate('/procurement/purchases/new')} />)}
            </div>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
