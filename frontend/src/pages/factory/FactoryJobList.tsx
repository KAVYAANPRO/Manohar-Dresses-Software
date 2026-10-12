import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Clock, ChevronRight, AlertTriangle } from 'lucide-react';
import { portalApi, type PortalJob } from '../../lib/api/jobwork';
import { toProblem, fmtDate, fmtQty, type BackendJobSlipStatus } from '../../lib/api/production';
import { TabPill, EmptyState, STAGGER_CHILDREN } from '../pageKit';

/** Plain-language status for the factory (UX-02). */
export const PORTAL_STATUS: Record<BackendJobSlipStatus, { label: string; cls: string }> = {
  CREATED: { label: 'Waiting for Material', cls: 'bg-gray-100 text-gray-600' },
  MATERIAL_ISSUED: { label: 'Material Received', cls: 'bg-yellow-100 text-yellow-800' },
  IN_PROCESS: { label: 'In Process', cls: 'bg-[#FFDCE5] text-[#8F002B]' },
  READY: { label: 'Ready', cls: 'bg-green-100 text-green-800' },
  PARTIALLY_RECEIVED: { label: 'Partly Delivered', cls: 'bg-amber-100 text-amber-800' },
  RECEIVED: { label: 'Delivered', cls: 'bg-gray-100 text-gray-600' },
  CLOSED: { label: 'Completed', cls: 'bg-gray-100 text-gray-600' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-red-100 text-red-700' },
};
export const isActiveJob = (s: BackendJobSlipStatus) => !['RECEIVED', 'CLOSED', 'CANCELLED'].includes(s);

export function FactoryJobList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<PortalJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'Active' | 'All'>('Active');

  useEffect(() => {
    portalApi.jobs().then(setJobs).catch(e => setError(toProblem(e).detail)).finally(() => setIsLoading(false));
  }, []);

  const filtered = filter === 'Active' ? jobs.filter(j => isActiveJob(j.status)) : jobs;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">My Jobs</h1>
        <p className="text-sm text-slate-500">All job slips given to you.</p>
      </div>

      <div className="flex gap-2 bg-slate-100 rounded-xl p-1">
        {(['Active', 'All'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`relative flex-1 py-2 min-h-12 rounded-lg text-sm font-medium transition-colors ${filter === f ? 'text-slate-900' : 'text-slate-500'}`}>{filter === f && <TabPill group="factory-jobs" />}<span className="relative">{f}</span></button>
        ))}
      </div>

      {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>}

      {isLoading ? (
        <div className="flex flex-col gap-3">{[1, 2].map(i => <div key={i} className="bg-white rounded-xl border border-slate-200 h-24 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState message={`No ${filter === 'Active' ? 'active ' : ''}jobs found.`} />
      ) : (
        <div className={`flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
          {filtered.map(job => (
            <button key={job.id} onClick={() => navigate(`/factory/jobs/${job.id}`)}
              className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 flex items-center gap-3 transition-all active:scale-[0.98] ${job.overdue ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-sm">{job.slipNumber}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PORTAL_STATUS[job.status].cls}`}>{PORTAL_STATUS[job.status].label}</span>
                  {job.overdue && <span className="text-xs text-red-600 font-medium">Overdue</span>}
                </div>
                <div className="text-xs text-slate-500 truncate mb-2">{job.design}</div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Package size={11} /> {fmtQty(job.expectedQty)} {job.jobType === 'PROCESSING' ? '' : 'pcs'}</span>
                  {job.dueDate && <span className={`flex items-center gap-1 ${job.overdue ? 'text-red-500' : ''}`}><Clock size={11} /> Due {fmtDate(job.dueDate)}</span>}
                  {job.pendingAcknowledgement && <span className="text-amber-600 font-medium">Confirm material received</span>}
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
