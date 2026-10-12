import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, Info, Undo2, FileText, Lock } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { Can } from '../../../lib/permissions/Can';
import { toProblem, fmtDate, fmtQty, JOB_SLIP_STATUS_LABEL, type ApiProblem } from '../../../lib/api/production';
import { reconciliationApi, materialReturnsApi, challanUrl, type ReconciliationSummary, type ReconMaterial } from '../../../lib/api/jobwork';
import { STAGGER_CHILDREN } from '../../pageKit';
import { AnimatedNumber } from '../../../components/motion';

type Action =
  | { kind: 'return'; material: ReconMaterial; qty: number }
  | { kind: 'writeoff' }
  | { kind: 'shortclose' }
  | { kind: 'close' };

const inputCls = 'flex-1 min-w-0 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]';

export function ReconciliationDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReconciliationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<Action | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [shortReason, setShortReason] = useState('');

  const load = useCallback(() => {
    if (!id) return;
    reconciliationApi.summary(id)
      .then(d => { setData(d); setProblem(null); })
      .catch(e => setProblem(toProblem(e)))
      .finally(() => setIsLoading(false));
  }, [id]);
  useEffect(load, [load]);

  const run = async () => {
    if (!action || !data) return;
    const a = action;
    setAction(null); setBusy(true); setProblem(null); setNotice('');
    try {
      if (a.kind === 'return') {
        await materialReturnsApi.create({ jobSlipId: data.jobSlipId, lines: [{ materialVariantId: a.material.materialVariantId!, qtyBase: a.qty }], notes: 'Returned at reconciliation', confirm: true });
        setReturnQty(r => ({ ...r, [a.material.material]: '' }));
        setNotice(`${fmtQty(a.qty)} ${a.material.uom} of ${a.material.material} returned to the warehouse.`);
      } else if (a.kind === 'writeoff') {
        await reconciliationApi.writeOff(data.jobSlipId, reason.trim());
        setReason('');
        setNotice('Remaining custody written off as shortage.');
      } else if (a.kind === 'shortclose') {
        await reconciliationApi.shortClose(data.jobSlipId, shortReason.trim());
        setShortReason('');
        setNotice('Job short-closed: no more pieces are expected.');
      } else {
        await reconciliationApi.close(data.jobSlipId);
        setNotice('Job closed. Cost is now final.');
      }
      load();
    } catch (e) {
      setProblem(toProblem(e));
    } finally {
      setBusy(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) {
    return (
      <div className="flex flex-col gap-4 max-w-3xl">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500"><ArrowLeft size={16} /> Back</button>
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{problem?.detail ?? 'Reconciliation not found.'}</div>
      </div>
    );
  }

  const p = data.production;
  const isProcessing = data.jobType === 'PROCESSING';
  const unresolved = data.materials.filter(m => m.status === 'UNRESOLVED');
  const closed = data.status === 'CLOSED' || data.status === 'CANCELLED';

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate(-1)} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 mt-0.5" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Reconciliation — {data.jobSlipNo}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${data.status === 'CLOSED' ? 'bg-slate-100 text-slate-600' : 'bg-[#FFDCE5] text-[#B80037]'}`}>{JOB_SLIP_STATUS_LABEL[data.status]}</span>
          </div>
          <p className="text-sm text-slate-500 break-words">{data.jobWorkerName} · {data.designNo}{data.processingType ? ` · ${data.processingType}` : ''}</p>
        </div>
      </div>

      {problem && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /><div>{problem.code && <div className="font-semibold text-xs uppercase">{problem.code.replace(/_/g, ' ')}</div>}{problem.detail}</div>
        </div>
      )}
      {notice && <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3"><CheckCircle size={16} className="shrink-0 mt-0.5" /> {notice}</div>}

      {/* Production comparison (JOB-11) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">{isProcessing ? 'Processing (Sent vs Received)' : 'Production Comparison'}</div>
        {isProcessing && data.processing ? (
          <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 text-center ${STAGGER_CHILDREN}`}>
            {[
              { label: 'Sent', value: data.processing.sent || data.processing.issuedNet, cls: 'text-slate-900' },
              { label: 'Received', value: data.processing.received, cls: 'text-green-700' },
              { label: 'Shortage', value: data.processing.shortage, cls: data.processing.shortage > 0 ? 'text-red-600' : 'text-slate-400' },
              { label: 'Shortage %', value: data.processing.shortagePct, cls: data.processing.toleranceExceeded ? 'text-red-600' : 'text-slate-700', suffix: '%' },
            ].map(x => (
              <div key={x.label} className="bg-slate-50 rounded-xl p-3">
                <div className="text-xs text-slate-400 mb-1">{x.label}</div>
                <div className={`text-2xl font-bold ${x.cls}`}><AnimatedNumber value={x.value} format={fmtQty} />{x.suffix ?? ''}</div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
              {[
                { label: 'Expected', value: p.expected, cls: 'text-slate-900' },
                { label: 'Received', value: p.received, cls: p.difference < 0 ? 'text-red-600' : 'text-green-700' },
                { label: 'Accepted', value: p.accepted, cls: 'text-green-700' },
                { label: 'Rejected', value: p.rejected, cls: p.rejected > 0 ? 'text-red-600' : 'text-slate-400' },
                { label: 'Damaged', value: p.damaged, cls: p.damaged > 0 ? 'text-red-600' : 'text-slate-400' },
              ].map(({ label, value, cls }) => (
                <div key={label} className="bg-slate-50 rounded-xl p-3">
                  <div className="text-xs text-slate-400 mb-1">{label}</div>
                  <div className={`text-2xl font-bold ${cls}`}>{fmtQty(value)}</div>
                  <div className="text-xs text-slate-400">pcs</div>
                </div>
              ))}
            </div>
            {p.difference !== 0 && (
              <div className={`mt-3 flex items-center gap-2 text-sm font-medium ${p.difference < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {p.difference < 0 ? <AlertTriangle size={15} /> : <CheckCircle size={15} />}
                Difference: {p.difference > 0 ? '+' : ''}{fmtQty(p.difference)} pcs ({p.differencePct > 0 ? '+' : ''}{p.differencePct}%)
              </div>
            )}
            {p.variants.length > 1 && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-slate-500">
                {p.variants.map(v => <div key={v.key}>{v.label}: {fmtQty(v.received)} / {fmtQty(v.expected)} received ({fmtQty(v.accepted)} accepted)</div>)}
              </div>
            )}
          </>
        )}
      </div>

      {data.flags.length > 0 && (
        <div className="flex flex-col gap-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          {data.flags.map((f, i) => <div key={i} className="flex items-start gap-2"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {f}</div>)}
        </div>
      )}

      {/* Material reconciliation (SHR-02) */}
      <div className="flex flex-col gap-4">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Material Reconciliation</div>
        {data.materials.length === 0 && <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-400 text-center">No material has been issued to this job.</div>}
        {data.materials.map(m => {
          const isUnresolved = m.status === 'UNRESOLVED';
          const qtyStr = returnQty[m.material] ?? '';
          const qty = Number(qtyStr);
          return (
            <div key={m.material} className={`bg-white rounded-xl border shadow-sm p-4 md:p-5 flex flex-col gap-3 ${isUnresolved ? 'border-red-200' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="font-semibold text-slate-900">{m.material}</div>
                  <div className="text-xs text-slate-400">{m.bomRole ?? ''}{m.bomQtyPerGarment ? ` · ${m.bomQtyPerGarment} ${m.uom}/pc` : ''} · tolerance {m.tolerancePct}%</div>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${isUnresolved ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                  {isUnresolved ? <><XCircle size={12} /> Unresolved</> : <><CheckCircle size={12} /> Resolved</>}
                </span>
              </div>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-center text-xs">
                {[
                  { label: 'Issued', value: m.issued, cls: 'text-slate-900' },
                  { label: 'Returned', value: m.returned, cls: 'text-[#B80037]' },
                  { label: 'Consumed', value: m.consumed, cls: 'text-slate-700' },
                  { label: 'Written Off', value: m.writtenOff, cls: m.writtenOff > 0 ? 'text-amber-700' : 'text-slate-400' },
                  { label: 'Remaining', value: m.remaining, cls: m.remaining > 0 ? 'text-orange-600 font-bold' : 'text-slate-400' },
                  { label: `Shortage (${m.shortagePct}%)`, value: m.shortage, cls: m.toleranceExceeded ? 'text-red-600 font-bold' : m.shortage > 0 ? 'text-amber-700' : 'text-slate-400' },
                ].map(({ label, value, cls }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2">
                    <div className="text-slate-400 mb-0.5">{label}</div>
                    <div className={`text-base font-semibold ${cls}`}>{fmtQty(value)}</div>
                    <div className="text-slate-400">{m.uom}</div>
                  </div>
                ))}
              </div>
              {m.expectedPiecesFromMaterial !== undefined && (
                <div className="text-xs text-slate-500 flex items-center gap-1"><Info size={12} /> Material issued is enough for {m.expectedPiecesFromMaterial} pcs.</div>
              )}
              {isUnresolved && m.remaining > 0 && m.materialVariantId && !closed && (
                <Can perm={["issuance.edit", "issuance.confirm"]}>
                  <div className="flex flex-col sm:flex-row gap-2 border-t border-red-100 pt-3">
                    <input type="number" inputMode="decimal" min="0" step="0.001" className={inputCls} placeholder={`Qty to return (max ${fmtQty(m.remaining)} ${m.uom})`} value={qtyStr} onChange={e => setReturnQty(r => ({ ...r, [m.material]: e.target.value }))} />
                    <Button variant="outline" disabled={!(qty > 0) || busy} onClick={() => setAction({ kind: 'return', material: m, qty })} className="w-full sm:w-auto">
                      <Undo2 size={14} /> Return to Warehouse
                    </Button>
                    <Button variant="ghost" disabled={busy} onClick={() => setReturnQty(r => ({ ...r, [m.material]: String(m.remaining) }))} className="w-full sm:w-auto">All {fmtQty(m.remaining)}</Button>
                  </div>
                </Can>
              )}
            </div>
          );
        })}
      </div>

      {data.writeOffs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Write-offs</div>
          {data.writeOffs.map((w, i) => <div key={i} className="text-slate-600">{w.material}: {fmtQty(w.qty)} — {w.reason} <span className="text-slate-400">({fmtDate(w.postedAt)})</span></div>)}
        </div>
      )}

      {/* Write off whatever remains */}
      {unresolved.some(m => m.remaining > 0) && !closed && (
        <Can perm="reconciliation.approve">
          <div className="bg-white rounded-xl border border-red-200 shadow-sm p-4 md:p-5 flex flex-col gap-2">
            <div className="text-sm font-semibold text-red-700 flex items-center gap-1.5"><AlertTriangle size={14} /> Write off everything still in custody as shortage</div>
            <p className="text-xs text-slate-500">Return what the factory still has first. The rest is moved to loss with your reason (approval permission required).</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className={inputCls} placeholder="Reason for shortage (required)" value={reason} onChange={e => setReason(e.target.value)} />
              <Button variant="danger" disabled={!reason.trim() || busy} onClick={() => setAction({ kind: 'writeoff' })} className="w-full sm:w-auto">Write Off</Button>
            </div>
          </div>
        </Can>
      )}

      {data.status === 'PARTIALLY_RECEIVED' && (
        <Can perm="jobslips.edit">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-2">
            <div className="text-sm font-semibold text-slate-900">No more pieces coming?</div>
            <p className="text-xs text-slate-500">Short-close marks the job received with fewer pieces than expected ({fmtQty(data.garmentShortfall ?? 0)} pcs short).</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input className={inputCls} placeholder="Reason (required)" value={shortReason} onChange={e => setShortReason(e.target.value)} />
              <Button variant="outline" disabled={!shortReason.trim() || busy} onClick={() => setAction({ kind: 'shortclose' })} className="w-full sm:w-auto">Short-close</Button>
            </div>
          </div>
        </Can>
      )}

      {/* Documents */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm flex flex-col gap-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Documents</div>
        {data.issues.map(i => (
          <div key={i._id} className="flex flex-wrap items-center justify-between gap-2">
            <span>Issue {i.docNo} · {fmtDate(i.docDate)} · {fmtQty(i.qty)} · {i.status}{i.acknowledgedAt ? ' · acknowledged' : ''}{i.discrepancyNote ? ` · note: ${i.discrepancyNote}` : ''}</span>
            {i.status === 'CONFIRMED' && <a href={challanUrl(i._id)} target="_blank" rel="noreferrer" className="text-[#E40043] text-xs flex items-center gap-1 hover:underline"><FileText size={13} /> Delivery challan</a>}
          </div>
        ))}
        {data.receipts.map(r => (
          <div key={r._id} className="flex flex-wrap items-center justify-between gap-2">
            <span>Receipt {r.docNo} · {fmtDate(r.docDate)} · {fmtQty(r.received)} received · {r.status}</span>
            {!isProcessing && <Link to={`/production/receiving/${r._id}`} className="text-[#E40043] text-xs hover:underline">Open</Link>}
          </div>
        ))}
        {data.returns.map(r => <div key={r._id}>Return {r.docNo} · {fmtDate(r.docDate)} · {fmtQty(r.qty)} · {r.status}</div>)}
        {data.issues.length + data.receipts.length + data.returns.length === 0 && <div className="text-slate-400">None yet.</div>}
      </div>

      {/* Close job (JOB-12) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <div className="font-semibold text-slate-900 flex items-center gap-1.5">{data.status === 'CLOSED' && <Lock size={14} />} Close Job</div>
          {data.canClose
            ? <p className="text-xs text-slate-500 mt-0.5">Everything is reconciled. Closing locks the job and finalises its cost.</p>
            : <ul className="text-xs text-slate-500 mt-0.5 list-disc pl-4">{data.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul>}
        </div>
        <Can perm="jobslips.confirm">
          <Button variant="primary" disabled={!data.canClose || busy} isLoading={busy} onClick={() => setAction({ kind: 'close' })} className="w-full sm:w-auto shrink-0">Close Job</Button>
        </Can>
      </div>

      <ConfirmDialog
        open={action !== null}
        title={action?.kind === 'return' ? 'Return material' : action?.kind === 'writeoff' ? 'Write off shortage' : action?.kind === 'shortclose' ? 'Short-close job' : `Close job ${data.jobSlipNo}?`}
        impact={
          action?.kind === 'return' ? `${fmtQty(action.qty)} ${action.material.uom} of ${action.material.material} moves from the factory's custody back to the warehouse, into its original lot.`
            : action?.kind === 'writeoff' ? `All material still in custody for this job is written off to loss with reason "${reason}". This cannot be undone.`
            : action?.kind === 'shortclose' ? `The job is marked received with ${fmtQty(p.received)} of ${fmtQty(p.expected)} pieces. Reason: "${shortReason}".`
            : 'Closing locks the job: no further issue, receiving or returns. Provisional costs of the finished lots are trued up to the final cost. This cannot be undone.'
        }
        confirmLabel={action?.kind === 'return' ? 'Return' : action?.kind === 'writeoff' ? 'Write Off' : action?.kind === 'shortclose' ? 'Short-close' : 'Close Job'}
        danger={action?.kind === 'writeoff' || action?.kind === 'close'}
        isLoading={busy}
        onConfirm={run}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}
