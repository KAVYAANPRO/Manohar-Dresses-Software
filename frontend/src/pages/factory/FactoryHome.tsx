import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, Package, CheckCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { portalApi, type PortalJob } from '../../lib/api/jobwork';
import { toProblem, fmtDate, fmtQty } from '../../lib/api/production';
import { PORTAL_STATUS, isActiveJob } from './FactoryJobList';
import { EmptyState, STAGGER_CHILDREN } from '../pageKit';

function nextAction(j: PortalJob): string {
  if (j.status === 'CREATED') return 'Waiting for material from the office';
  if (j.pendingAcknowledgement) return 'Confirm the material you received';
  if (j.status === 'MATERIAL_ISSUED') return 'Start work';
  if (j.status === 'IN_PROCESS') return 'Mark Ready when done';
  return 'Tell the office how many pieces you are sending';
}

export function FactoryHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<PortalJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi.jobs()
      .then(all => setJobs(all.filter(j => isActiveJob(j.status))))
      .catch(e => setError(toProblem(e).detail))
      .finally(() => setIsLoading(false));
  }, []);

  const overdueCount = jobs.filter(j => j.overdue).length;
  const activeCount = jobs.filter(j => j.status === 'IN_PROCESS' || j.status === 'MATERIAL_ISSUED').length;
  const readyCount = jobs.filter(j => j.status === 'READY').length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 break-words">Hello, {user?.name}</h1>
        <p className="text-sm text-slate-500 mt-0.5">Here's your work summary for today.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#B80037]">{activeCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">In Hand</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm">
          <div className={`text-2xl font-bold ${overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>{overdueCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Overdue</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-green-600">{readyCount}</div>
          <div className="text-xs text-slate-500 mt-0.5">Ready</div>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>}

      {overdueCount > 0 && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">{overdueCount} job{overdueCount > 1 ? 's are' : ' is'} past the due date. Please update the status or contact the office.</p>
        </div>
      )}

      <div>
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Active Jobs</div>
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-1/3 mb-3" /><div className="h-3 bg-slate-200 rounded w-2/3 mb-2" /><div className="h-3 bg-slate-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState message="No active jobs assigned. Check back later." />
        ) : (
          <div className={`flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
            {jobs.map(job => (
              <button key={job.id} onClick={() => navigate(`/factory/jobs/${job.id}`)}
                className={`w-full text-left bg-white rounded-xl border shadow-sm p-4 transition-all active:scale-[0.98] ${job.overdue ? 'border-red-200' : 'border-slate-200 hover:border-[#FFB8CA]'}`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">{job.slipNumber}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{job.design}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${PORTAL_STATUS[job.status].cls}`}>{PORTAL_STATUS[job.status].label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                  <span className="flex items-center gap-1"><Package size={12} /> {fmtQty(job.expectedQty)} {job.jobType === 'PROCESSING' ? '' : 'pcs'}</span>
                  {job.dueDate && <span className={`flex items-center gap-1 ${job.overdue ? 'text-red-600 font-medium' : ''}`}><Clock size={12} /> Due {fmtDate(job.dueDate)}</span>}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#B80037] bg-[#FFF0F3] rounded-lg px-3 py-2">
                  <CheckCircle size={12} /> {nextAction(job)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
