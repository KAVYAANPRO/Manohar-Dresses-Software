import { useNavigate } from 'react-router-dom';
import { KPICard } from '../../components/ui/KPICard';
import { Card, CardHeader } from '../../components/ui/Card';
import { Activity, Clock, AlertTriangle, TrendingUp, RotateCcw, Truck } from 'lucide-react';
import { dashboardsApi, fmtDate, timeAgo } from '../../lib/api/insights';
import { RangeFilter, useRange, useDashboardData, ErrorBanner, EmptyNote, ListSkeleton, AlertRow, trendOf, TREND_LABEL, PERIOD_LABEL } from './dashboardKit';
import { SmartInsightsPanel } from './SmartInsightsPanel';
import { STAGGER_CHILDREN } from '../pageKit';
import { FadeIn } from '../../components/motion';

export function ProductionDashboard() {
  const navigate = useNavigate();
  const range = useRange('monthly');
  const { data, isLoading, error } = useDashboardData(() => dashboardsApi.production(range.params), [range.key]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Production Dashboard</h1>
          <p className="text-muted">Monitor job progress, overdue jobs, and reconciliation.</p>
        </div>
        <RangeFilter state={range} />
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <KPICard title="Jobs in Progress" value={data ? data.activeJobs : '—'} icon={<Activity size={20} />} isLoading={isLoading} onClick={() => navigate('/production/job-slips')} />
        <KPICard title="Pending Jobs (not issued)" value={data ? data.createdJobs : '—'} icon={<Clock size={20} />} isLoading={isLoading} onClick={() => navigate('/production/job-slips')} />
        <KPICard
          title="Overdue Jobs"
          value={data ? data.overdueCount : '—'}
          icon={<AlertTriangle size={20} className="text-[var(--color-error)]" />}
          isLoading={isLoading}
          trend={data && data.overdueCount > 0 ? { value: 'Action required', isPositive: false, label: 'past expected date' } : undefined}
        />
        <KPICard
          title={`Production Completed (${PERIOD_LABEL[range.range]})`}
          value={data ? `${data.productionCompleted.toLocaleString('en-IN')} pcs` : '—'}
          icon={<TrendingUp size={20} />}
          isLoading={isLoading}
          trend={trendOf(data?.productionCompletedTrendPct, TREND_LABEL[range.range])}
          onClick={() => navigate('/production/receiving')}
        />
        <KPICard title="Awaiting Reconciliation" value={data ? data.awaitingReconciliation : '—'} icon={<RotateCcw size={20} />} isLoading={isLoading} onClick={() => navigate('/production/job-slips')} />
        <KPICard title="High Shortage Jobs" value={data ? data.shortageAlerts.length : '—'} icon={<AlertTriangle size={20} className="text-[var(--color-warning)]" />} isLoading={isLoading} />
      </div>

      <SmartInsightsPanel />

      <FadeIn delay={0.12} className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        <Card className="min-h-[300px]">
          <CardHeader title="Overdue Jobs" />
          {isLoading ? <ListSkeleton /> : !data || data.overdueJobs.length === 0 ? (
            <EmptyNote>No job is past its expected completion date.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.overdueJobs.map(job => (
                <div key={job.id} className="bg-red-50 border border-red-100 p-3 rounded-md flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-800 break-words">{job.docNo} · {job.jobWorkerName}</p>
                    <p className="text-xs text-red-600 break-words">{job.designName} · due {fmtDate(job.expectedCompletionDate)} · {job.daysLate} day{job.daysLate === 1 ? '' : 's'} overdue</p>
                  </div>
                  <button type="button" onClick={() => navigate(`/production/job-slips/${job.id}`)}
                    className="w-full sm:w-auto shrink-0 px-3 py-2 sm:py-1.5 text-sm font-medium rounded-lg border border-red-200 bg-white text-red-700">
                    Follow Up
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="min-h-[300px]">
          <CardHeader title="Recent Finished Goods Receipts" />
          {isLoading ? <ListSkeleton /> : !data || data.recentReceipts.length === 0 ? (
            <EmptyNote>No receipts confirmed yet.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-3">
              {data.recentReceipts.map(r => (
                <div key={r.id} className="flex items-start gap-3 border-b border-[var(--color-border)] pb-3 last:border-0 last:pb-0">
                  <Truck size={16} className="text-teal-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{r.docNo} · {r.qty.toLocaleString('en-IN')} pcs</p>
                    <p className="text-xs text-muted break-words">{r.jobSlipNo} · {r.jobWorkerName} · {timeAgo(r.at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {data && data.shortageAlerts.length > 0 && (
          <Card>
            <CardHeader title="Shortage Over Tolerance" />
            <div className="flex flex-col gap-3">
              {data.shortageAlerts.map(a => <AlertRow key={a.key} alert={a} action="Reconcile" onOpen={navigate} />)}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Open Jobs by Factory / Artisan" />
          {isLoading ? <ListSkeleton /> : !data || data.openJobsByWorker.length === 0 ? (
            <EmptyNote>No open jobs.</EmptyNote>
          ) : (
            <div className="flex flex-col gap-2">
              {data.openJobsByWorker.map(w => (
                <div key={w.jobWorkerId} className="flex justify-between items-center gap-3 border-b border-[var(--color-border)] py-2 last:border-0">
                  <p className="text-sm font-medium min-w-0 break-words">{w.jobWorkerName}</p>
                  <p className="text-sm font-semibold shrink-0">{w.openJobs} job{w.openJobs === 1 ? '' : 's'}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </FadeIn>
    </div>
  );
}
