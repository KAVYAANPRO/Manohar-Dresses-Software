import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FlaskConical, AlertTriangle } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { processingJobsApi, type ProcessingJobRow } from '../../../lib/api/jobwork';
import { toProblem, fmtDate, fmtQty, JOB_SLIP_STATUS_LABEL, type BackendJobSlipStatus } from '../../../lib/api/production';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';
import { PickerSheet, PickerField } from '../../../components/forms/PickerSheet';

const statusCls: Partial<Record<BackendJobSlipStatus, string>> = {
  CREATED: 'bg-gray-100 text-gray-700',
  MATERIAL_ISSUED: 'bg-yellow-100 text-yellow-700',
  IN_PROCESS: 'bg-[#FFDCE5] text-[#B80037]',
  READY: 'bg-[#FFDCE5] text-[#B80037]',
  PARTIALLY_RECEIVED: 'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

const ShortagePct = ({ v }: { v: number | null }) =>
  v != null ? <span className={v > 5 ? 'text-red-600 font-medium' : 'text-slate-600'}>{v.toFixed(1)}%</span> : <>—</>;

export function ProcessingJobList() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ProcessingJobRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);

  useEffect(() => {
    processingJobsApi.list()
      .then(setJobs)
      .catch(e => setError(toProblem(e).detail))
      .finally(() => setIsLoading(false));
  }, []);

  const q = search.toLowerCase();
  const filtered = jobs.filter(j =>
    (j.jobNumber.toLowerCase().includes(q) || j.processType.toLowerCase().includes(q) ||
      j.factoryName.toLowerCase().includes(q) || j.inputMaterial.toLowerCase().includes(q) || j.outputMaterial.toLowerCase().includes(q)) &&
    (!statusFilter || j.status === statusFilter)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Processing Jobs</h1>
          <p className="text-sm text-slate-500 mt-0.5">Dyeing, printing, embroidery and other material conversion jobs</p>
        </div>
        <Can perm="processing.edit">
          <button onClick={() => navigate('/production/processing/new')} className="flex items-center justify-center gap-2 w-full sm:w-auto shrink-0 min-h-10 px-4 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium">
            <Plus size={16} /> New Processing Job
          </button>
        </Can>
      </div>

      {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3 p-3 md:p-4 border-b border-slate-100">
          <input type="text" placeholder="Search by job number, process, factory or material…" value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-0 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
          <PickerField
            className="sm:w-56"
            value={statusFilter ? JOB_SLIP_STATUS_LABEL[statusFilter as BackendJobSlipStatus] : 'All Statuses'}
            onOpen={() => setStatusPickerOpen(true)}
          />
          <PickerSheet
            open={statusPickerOpen}
            title="Filter by status"
            items={[{ id: '', title: 'All Statuses' }, ...Object.keys(statusCls).map(st => ({ id: st, title: JOB_SLIP_STATUS_LABEL[st as BackendJobSlipStatus] }))]}
            selectedId={statusFilter}
            searchPlaceholder="Search status…"
            onSelect={it => { setStatusFilter(it.id); setStatusPickerOpen(false); }}
            onClose={() => setStatusPickerOpen(false)}
          />
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3 p-3">{[1, 2, 3].map(i => <div key={i} className="skeleton rounded-lg h-24" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FlaskConical} message="No processing jobs found." className="border-0" />
        ) : (
          <>
            <div className={`md:hidden flex flex-col gap-3 p-3 ${STAGGER_CHILDREN}`}>
              {filtered.map(j => (
                <div key={j.id} onClick={() => navigate(`/production/processing/${j.id}`)} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] cursor-pointer pressable active:bg-slate-50">
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-[#E40043]">{j.jobNumber}</div>
                      <div className="text-xs text-slate-500">{j.processType} · {j.factoryName}</div>
                    </div>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors shrink-0 ${statusCls[j.status] ?? ''}`}>{JOB_SLIP_STATUS_LABEL[j.status]}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-xs font-medium text-muted">Input Material</div><div className="text-slate-600">{j.inputMaterial || '—'}</div></div>
                    <div><div className="text-xs font-medium text-muted">Qty In</div><div>{fmtQty(j.inputQty)} {j.inputUom}</div></div>
                    <div><div className="text-xs font-medium text-muted">Output Material</div><div className="text-slate-600">{j.outputMaterial}</div></div>
                    <div><div className="text-xs font-medium text-muted">Expected Out</div><div>{fmtQty(j.expectedOutputQty)} {j.outputUom}</div></div>
                    <div><div className="text-xs font-medium text-muted">Actual Out</div><div>{j.actualOutputQty != null ? `${fmtQty(j.actualOutputQty)} ${j.outputUom}` : '—'}</div></div>
                    <div><div className="text-xs font-medium text-muted">Shortage %</div><div><ShortagePct v={j.shortagePercent} /></div></div>
                    <div><div className="text-xs font-medium text-muted">Issue Date</div><div className="text-slate-500">{fmtDate(j.issueDate)}</div></div>
                    <div><div className="text-xs font-medium text-muted">Return By</div><div className="text-slate-500">{fmtDate(j.expectedReturnDate)}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                  <tr>{['Job #', 'Process Type', 'Factory', 'Input Material', 'Qty In', 'Output Material', 'Expected Out', 'Actual Out', 'Shortage %', 'Issue Date', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(j => (
                    <tr key={j.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/production/processing/${j.id}`)}>
                      <td className="px-4 py-3 font-medium text-[#E40043]">{j.jobNumber}</td>
                      <td className="px-4 py-3">{j.processType}</td>
                      <td className="px-4 py-3">{j.factoryName}</td>
                      <td className="px-4 py-3 text-slate-600">{j.inputMaterial || '—'}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{fmtQty(j.inputQty)} {j.inputUom}</td>
                      <td className="px-4 py-3 text-slate-600">{j.outputMaterial}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{fmtQty(j.expectedOutputQty)} {j.outputUom}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{j.actualOutputQty != null ? `${fmtQty(j.actualOutputQty)} ${j.outputUom}` : '—'}</td>
                      <td className="px-4 py-3 text-right"><ShortagePct v={j.shortagePercent} /></td>
                      <td className="px-4 py-3 text-slate-500">{fmtDate(j.issueDate)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${statusCls[j.status] ?? ''}`}>{JOB_SLIP_STATUS_LABEL[j.status]}</span></td>
                      <td className="px-4 py-3"><span className="text-[#E40043] hover:underline text-xs">View</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
