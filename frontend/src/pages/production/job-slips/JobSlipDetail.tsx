import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, CheckCircle, Circle, XCircle, MessageCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { WhatsAppShareDialog } from '../../../components/feedback/WhatsAppShareDialog';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { JOB_SLIP_STATUSES } from '../../../types/domain';
import {
  designsApi, jobSlipsApi, jobWorkersApi, lookupsApi, toProblem, fmtDate, fmtQty,
  JOB_SLIP_STATUS_LABEL, CHARGE_BASIS_LABEL,
  type JobSlipRecord, type DesignRecord, type JobWorkerLite, type IssuePlan, type NamedRecord,
} from '../../../lib/api/production';
import { STAGGER_CHILDREN } from '../../pageKit';

const STATUS_STEPS = JOB_SLIP_STATUSES;

export function JobSlipDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [slip, setSlip] = useState<JobSlipRecord | null>(null);
  const [design, setDesign] = useState<DesignRecord | null>(null);
  const [worker, setWorker] = useState<JobWorkerLite | null>(null);
  const [plan, setPlan] = useState<IssuePlan | null>(null);
  const [colours, setColours] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const s = await jobSlipsApi.get(id);
      setSlip(s);
      const [d, w, p, c, sz] = await Promise.all([
        designsApi.get(String(s.designId)).catch(() => null),
        jobWorkersApi.get(String(s.jobWorkerId)).catch(() => null),
        jobSlipsApi.issuePlan(id).catch(() => null),
        lookupsApi.colours().catch(() => []),
        lookupsApi.sizes().catch(() => []),
      ]);
      setDesign(d); setWorker(w); setPlan(p); setColours(c); setSizes(sz);
    } catch (err) {
      setError(toProblem(err, 'Could not load this job slip.').detail);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); }
    catch (err) { setError(toProblem(err).detail); }
    finally { setBusy(false); }
  };

  if (isLoading) return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  if (!slip) return <div className="p-6 text-slate-500">{error || 'Job slip not found.'}</div>;

  const status = JOB_SLIP_STATUS_LABEL[slip.status];
  const stepIndex = STATUS_STEPS.indexOf(status as typeof STATUS_STEPS[number]);
  const isCancelled = slip.status === 'CANCELLED';
  const batchQty = slip.expectedOutputLines.reduce((t, l) => t + l.expectedQty, 0);
  const designLabel = design ? `${design.designNo} — ${design.name}` : '—';
  const unit = slip.chargeBasis === 'PER_PIECE' ? 'pc' : slip.chargeBasis === 'PER_METER' ? 'm' : 'job';
  const canIssue = ['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY'].includes(slip.status);
  const canEdit = !['CLOSED', 'CANCELLED'].includes(slip.status);
  const cName = (cid?: string) => colours.find(c => c._id === String(cid))?.name ?? '';
  const sName = (sid?: string) => sizes.find(s => s._id === String(sid))?.name ?? '';
  const materials = plan?.lines ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/production/job-slips')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors mt-0.5">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">{slip.docNo}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
              isCancelled ? 'bg-red-100 text-red-800' :
              slip.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' :
              slip.status === 'IN_PROCESS' ? 'bg-[#FFDCE5] text-[#8F002B]' :
              slip.status === 'READY' || slip.status === 'RECEIVED' ? 'bg-green-100 text-green-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>{status}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{worker?.name ?? '—'} · {designLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {canIssue && <Button variant="secondary" onClick={() => navigate(`/production/issuance/${id}`)} className="flex-1 sm:flex-none">Issue Materials</Button>}
          <Button variant="secondary" onClick={() => setWhatsappOpen(true)} className="flex-1 sm:flex-none">
            <MessageCircle size={14} className="text-green-600" /> Send to Karigar
          </Button>
          {canEdit && (
            <Button variant="secondary" onClick={() => navigate(`/production/job-slips/${id}/edit`)} className="flex-1 sm:flex-none">
              <Edit size={14} /> Edit
            </Button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Progress</div>
        {isCancelled ? (
          <div className="flex flex-col gap-1 text-red-600 text-sm font-medium">
            <div className="flex items-center gap-2"><XCircle size={18} /> Job Slip Cancelled</div>
            {slip.cancelReason && <div className="text-xs text-red-500">Reason: {slip.cancelReason}</div>}
          </div>
        ) : (
          <>
            <div className="hidden md:flex items-center">
              {STATUS_STEPS.map((step, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      {done ? <CheckCircle size={20} className="text-green-500 shrink-0" /> : active ? <div className="w-5 h-5 rounded-full bg-[#E40043] border-2 border-[#FFB8CA] shrink-0" /> : <Circle size={20} className="text-slate-300 shrink-0" />}
                      <span className={`text-[10px] font-medium text-center leading-tight max-w-[70px] ${active ? 'text-[#B80037]' : done ? 'text-green-700' : 'text-slate-400'}`}>{step}</span>
                    </div>
                    {i < STATUS_STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 transition-colors duration-300 ${i < stepIndex ? 'bg-green-400' : 'bg-slate-200'}`} />}
                  </div>
                );
              })}
            </div>
            <div className={`md:hidden flex flex-col ${STAGGER_CHILDREN}`}>
              {STATUS_STEPS.map((step, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={step} className="relative flex items-center gap-3 min-h-[32px]">
                    {i < STATUS_STEPS.length - 1 && <span className={`absolute left-[4px] top-1/2 h-full w-0.5 transition-colors duration-300 ${done ? 'bg-green-300' : 'bg-slate-200'}`} />}
                    <span className="relative flex w-2.5 h-2.5 shrink-0">
                      {active && <span className="absolute inset-0 rounded-full bg-[#E40043]/40 animate-ping motion-reduce:hidden" />}
                      <span className={`relative w-2.5 h-2.5 rounded-full transition-colors duration-300 ${done ? 'bg-green-500' : active ? 'bg-[#E40043]' : 'bg-slate-200'}`} />
                    </span>
                    <span className={`text-sm ${active ? 'font-semibold text-[#B80037]' : done ? 'text-slate-500 line-through' : 'text-slate-400'}`}>{step}</span>
                    {active && <span className="text-xs bg-[#FFDCE5] text-[#B80037] px-1.5 py-0.5 rounded font-medium">Current</span>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2 mt-4 [&>*]:flex-1 sm:[&>*]:flex-none">
              {slip.status === 'MATERIAL_ISSUED' && <Button variant="outline" isLoading={busy} onClick={() => act(() => jobSlipsApi.setStatus(slip._id, 'IN_PROCESS'))}>Mark In Process</Button>}
              {(slip.status === 'MATERIAL_ISSUED' || slip.status === 'IN_PROCESS') && <Button variant="outline" isLoading={busy} onClick={() => act(() => jobSlipsApi.setStatus(slip._id, 'READY'))}>Mark Ready</Button>}
              {(slip.status === 'CREATED' || slip.status === 'MATERIAL_ISSUED') && <Button variant="ghost" onClick={() => setCancelOpen(true)} className="text-red-600">Cancel Job Slip</Button>}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Order Details</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
            {[
              ['Job Slip', slip.docNo],
              ['Date', fmtDate(slip.docDate)],
              ['Type', slip.jobType === 'MANUFACTURING' ? 'Manufacturing' : 'Processing'],
              ['Party', worker ? `${worker.name} (${worker.type === 'FACTORY' ? 'Factory' : 'Karigar'})` : '—'],
              ['Batch Qty', `${batchQty.toLocaleString('en-IN')} pcs`],
              ['Target Date', fmtDate(slip.expectedCompletionDate)],
              ['Charge Basis', CHARGE_BASIS_LABEL[slip.chargeBasis]],
              ['Agreed Rate', slip.agreedRate === undefined || slip.agreedRate === null ? 'Restricted' : `₹${slip.agreedRate.toLocaleString('en-IN')} / ${unit}`],
            ].map(([label, val]) => (
              <div key={label}>
                <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                <div className="font-medium text-slate-800 break-words">{val}</div>
              </div>
            ))}
          </div>
          {slip.expectedOutputLines.some(l => l.colourId) && (
            <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
              {slip.expectedOutputLines.map(l => (
                <span key={l._id} className="px-2 py-1 rounded bg-slate-100 text-xs text-slate-700">{cName(l.colourId)} / {sName(l.sizeId)}: <b>{l.expectedQty}</b></span>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {slip.instructions && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex-1">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Instructions</div>
              <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{slip.instructions}</pre>
            </div>
          )}
          {slip.remarks && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
              <div className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Remarks</div>
              <p className="text-sm text-amber-800">{slip.remarks}</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Material Issuance</div>
        </div>
        {materials.length === 0 && <div className="p-5 text-sm text-slate-400 text-center">{plan ? 'No BOM materials for this slip.' : 'Could not load material status.'}</div>}
        <div className={`md:hidden flex flex-col gap-3 p-3 ${STAGGER_CHILDREN}`}>
          {materials.map(m => {
            const fulfilled = m.pendingQty <= 0;
            const partial = m.issuedQty > 0 && !fulfilled;
            return (
              <div key={m.materialVariantId} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-medium text-slate-900 text-sm">{m.materialName}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors shrink-0 ${fulfilled ? 'bg-green-100 text-green-700' : partial ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                    {fulfilled ? 'Fulfilled' : partial ? 'Partial' : 'Pending'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs font-medium text-muted">Required</div><div className="text-slate-600">{fmtQty(m.requiredQty)} {m.uom}</div></div>
                  <div><div className="text-xs font-medium text-muted">Issued</div><div className="font-semibold text-slate-900">{fmtQty(m.issuedQty)} {m.uom}</div></div>
                  <div><div className="text-xs font-medium text-muted">Pending</div><div className="text-orange-600">{fmtQty(m.pendingQty)} {m.uom}</div></div>
                </div>
              </div>
            );
          })}
        </div>
        {materials.length > 0 && (
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Material', 'Required', 'Issued (net)', 'Pending', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {materials.map(m => {
                  const fulfilled = m.pendingQty <= 0;
                  const partial = m.issuedQty > 0 && !fulfilled;
                  return (
                    <tr key={m.materialVariantId} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">{m.materialName}{!m.inBom && <span className="text-xs text-slate-400"> (not in BOM)</span>}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtQty(m.requiredQty)} {m.uom}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{fmtQty(m.issuedQty)} {m.uom}</td>
                      <td className="px-4 py-3 text-orange-600">{fmtQty(m.pendingQty)} {m.uom}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${fulfilled ? 'bg-green-100 text-green-700' : partial ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                          {fulfilled ? 'Fulfilled' : partial ? 'Partial' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {(plan?.issues ?? []).length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 flex flex-col gap-1">
            {plan!.issues.map(iss => (
              <div key={iss._id}>{iss.docNo} · {fmtDate(iss.docDate)} · {iss.status.toLowerCase()} · {iss.lines.map(l => `${fmtQty(l.qtyBase)} ${l.uom ?? ''} ${l.materialName ?? ''}`).join(', ')}</div>
            ))}
          </div>
        )}
      </div>

      {(slip.status === 'RECEIVED' || slip.status === 'PARTIALLY_RECEIVED') && (
        <div className="flex gap-3">
          <Button onClick={() => navigate(`/production/reconciliation/${id}`)} className="w-full sm:w-auto">Open Reconciliation</Button>
        </div>
      )}

      <WhatsAppShareDialog
        open={whatsappOpen}
        title="Send Job Slip to Karigar"
        defaultNumber={worker?.mobile}
        message={`Job Slip ${slip.docNo}\nDesign: ${designLabel}\nBatch Qty: ${batchQty}\nTarget Date: ${fmtDate(slip.expectedCompletionDate)}\nRate: ₹${slip.agreedRate} / ${CHARGE_BASIS_LABEL[slip.chargeBasis]}\n\nInstructions:\n${slip.instructions ?? ''}`}
        onClose={() => setWhatsappOpen(false)}
      />

      <ConfirmDialog
        open={cancelOpen}
        title="Cancel Job Slip"
        danger
        impact={
          <div className="flex flex-col gap-2">
            <span>Cancel {slip.docNo}? {slip.status === 'MATERIAL_ISSUED' ? 'All issued material must have been returned first.' : 'No stock has moved for this slip.'}</span>
            <input className="input-field" placeholder="Reason (required)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </div>
        }
        confirmLabel="Cancel Job Slip"
        confirmDisabled={!cancelReason.trim()}
        isLoading={busy}
        onConfirm={() => { setCancelOpen(false); act(() => jobSlipsApi.cancel(slip._id, cancelReason.trim())); }}
        onCancel={() => setCancelOpen(false)}
      />
    </div>
  );
}
