import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Package, AlertTriangle, Truck } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { portalApi, type PortalJobDetail } from '../../lib/api/jobwork';
import { toProblem, fmtDate, fmtQty } from '../../lib/api/production';
import { PORTAL_STATUS } from './FactoryJobList';

type Act = 'ack' | 'start' | 'ready' | 'dispatch';

const fieldCls = 'w-full px-3 py-3 text-base border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E40043]';

export function FactoryJobDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<PortalJobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isActing, setIsActing] = useState(false);
  const [act, setAct] = useState<Act | null>(null);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState('');

  useEffect(() => {
    if (!id) return;
    portalApi.job(id).then(setJob).catch(e => setError(toProblem(e).detail)).finally(() => setIsLoading(false));
  }, [id]);

  const run = async () => {
    if (!job || !act) return;
    const a = act;
    setAct(null); setIsActing(true); setError(''); setNotice('');
    try {
      let next: PortalJobDetail;
      if (a === 'ack') next = await portalApi.acknowledge(job.id, note);
      else if (a === 'start') next = await portalApi.setStatus(job.id, 'IN_PROCESS');
      else if (a === 'ready') next = await portalApi.setStatus(job.id, 'READY');
      else next = await portalApi.declareDispatch(job.id, Number(qty), note);
      setJob(next);
      setNote(''); setQty('');
      setNotice(a === 'ack' ? 'Thank you — material receipt confirmed.' : a === 'dispatch' ? 'Dispatch noted. The office will count and confirm the goods.' : 'Status updated.');
    } catch (e) {
      setError(toProblem(e).detail);
    } finally {
      setIsActing(false);
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  if (!job) {
    return (
      <div className="flex flex-col gap-4">
        <button onClick={() => navigate('/factory/jobs')} className="flex items-center gap-2 text-sm text-slate-500 min-h-12"><ArrowLeft size={18} /> My Jobs</button>
        <div className="bg-white rounded-xl border border-slate-200 p-6 text-slate-500 text-sm">{error || 'Job not found.'}</div>
      </div>
    );
  }

  const totalExpected = job.expectedOutput.reduce((s, r) => s + r.qty, 0);
  const st = PORTAL_STATUS[job.status];
  const canDispatch = ['IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED', 'MATERIAL_ISSUED'].includes(job.status);
  const primary: { act: Act; label: string } | null =
    job.pendingAcknowledgement ? { act: 'ack', label: 'Confirm Material Received' }
      : job.status === 'MATERIAL_ISSUED' ? { act: 'start', label: 'Start Work' }
      : job.status === 'IN_PROCESS' ? { act: 'ready', label: 'Mark as Ready' }
      : job.status === 'READY' || job.status === 'PARTIALLY_RECEIVED' ? { act: 'dispatch', label: 'Declare Dispatch' }
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/factory/jobs')} className="flex items-center justify-center w-12 h-12 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{job.slipNumber}</h2>
          <p className="text-sm text-slate-500">{job.design}</p>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>}
      {notice && <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-3"><CheckCircle size={16} className="shrink-0 mt-0.5" /> {notice}</div>}

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between gap-3 flex-wrap shadow-sm">
        <div>
          <div className="text-xs text-slate-400 mb-1">Status</div>
          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${st.cls}`}>{st.label}</span>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 mb-1">Due Date</div>
          <div className={`font-semibold ${job.overdue ? 'text-red-600' : 'text-slate-800'}`}>{fmtDate(job.dueDate)}</div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center gap-2 flex-wrap">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">To Make</div>
          <span className="text-sm font-bold text-slate-900">{fmtQty(totalExpected)} {job.jobType === 'PROCESSING' ? job.expectedOutput[0]?.uom ?? '' : 'pcs'} total</span>
        </div>
        <div className="divide-y divide-slate-100">
          {job.expectedOutput.map((row, i) => (
            <div key={i} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {row.material ? <span className="font-medium text-slate-800">{row.material}</span> : (
                  <>
                    <span className="font-medium text-slate-800">{row.colour}</span>
                    <span className="min-w-7 h-7 px-1 rounded bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center">{row.size}</span>
                  </>
                )}
              </div>
              <span className="font-semibold text-slate-900 shrink-0">{fmtQty(row.qty)} {row.uom}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">Material With Me</div>
        {job.materialWithMe.length === 0 ? <div className="px-4 py-3 text-sm text-slate-400">No material sent yet.</div> : (
          <div className="divide-y divide-slate-100">
            {job.materialWithMe.map((m, i) => (
              <div key={i} className="px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-slate-800 min-w-0"><Package size={14} className="text-slate-400 shrink-0" /> {m.name}</div>
                  <span className="font-semibold text-slate-900 shrink-0">{fmtQty(m.remaining)} {m.uom}</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Received {fmtQty(m.issued)} · used {fmtQty(m.used)} · sent back {fmtQty(m.returned)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {job.materialIssues.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">Material Received</div>
          <div className="divide-y divide-slate-100">
            {job.materialIssues.map(mi => (
              <div key={mi.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-2"><span className="font-medium">{mi.docNo}</span><span className="text-xs text-slate-400">{fmtDate(mi.date)}</span></div>
                {mi.lines.map((l, i) => <div key={i} className="text-slate-600">{l.material}: {fmtQty(l.qty)} {l.uom}</div>)}
                <div className={`text-xs mt-1 ${mi.acknowledgedAt ? 'text-green-700' : 'text-amber-600'}`}>{mi.acknowledgedAt ? `Confirmed ${fmtDate(mi.acknowledgedAt)}` : 'Not confirmed yet'}{mi.discrepancyNote ? ` · Note: ${mi.discrepancyNote}` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(job.receivedByCompany.length > 0 || job.dispatchDeclarations.length > 0) && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Sent to Office</div>
          {job.dispatchDeclarations.map((d, i) => <div key={`d${i}`} className="text-slate-600">You declared {fmtQty(d.qty)} on {fmtDate(d.declaredAt)}{d.note ? ` — ${d.note}` : ''}</div>)}
          {job.receivedByCompany.map((r, i) => <div key={`r${i}`} className="text-slate-800">Office received {fmtQty(r.received)} ({fmtQty(r.accepted)} accepted{r.rejected ? `, ${fmtQty(r.rejected)} rejected` : ''}) on {fmtDate(r.date)}</div>)}
        </div>
      )}

      {job.instructions && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Instructions</div>
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{job.instructions}</pre>
        </div>
      )}

      {primary && (
        <Button variant="primary" className="w-full py-3 text-base min-h-12" onClick={() => setAct(primary.act)} isLoading={isActing}>
          {primary.act === 'dispatch' ? <Truck size={18} /> : <CheckCircle size={18} />} {primary.label}
        </Button>
      )}
      {primary && primary.act !== 'dispatch' && canDispatch && !job.pendingAcknowledgement && (
        <Button variant="outline" className="w-full py-3 text-base min-h-12" onClick={() => setAct('dispatch')}><Truck size={18} /> Declare Dispatch</Button>
      )}

      {act && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90dvh] overflow-y-auto p-5 sm:p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-slate-900">
                  {act === 'ack' ? 'Confirm material received' : act === 'dispatch' ? 'Declare dispatch' : act === 'start' ? 'Start work' : 'Mark as ready'}
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {act === 'ack' ? 'Did you receive all the material listed? If something is short or damaged, write it below.'
                    : act === 'dispatch' ? 'How many pieces are you sending to the office? The office will count and confirm.'
                    : `You are marking ${job.slipNumber} as ${act === 'start' ? 'In Process' : 'Ready'}. The office will be informed.`}
                </p>
              </div>
            </div>
            {act === 'dispatch' && <input type="number" inputMode="numeric" min="1" className={fieldCls} placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value)} />}
            {(act === 'ack' || act === 'dispatch') && <input className={fieldCls} placeholder={act === 'ack' ? 'Problem, if any (optional)' : 'Note (optional)'} value={note} onChange={e => setNote(e.target.value)} />}
            <div className="flex gap-3">
              <Button variant="primary" className="flex-1 min-h-12" disabled={act === 'dispatch' && !(Number(qty) > 0)} onClick={run}>Confirm</Button>
              <Button variant="secondary" className="flex-1 min-h-12" onClick={() => setAct(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
