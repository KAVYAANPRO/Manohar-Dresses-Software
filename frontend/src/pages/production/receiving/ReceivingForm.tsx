import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Info, CheckCircle, Scale } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { Can, RestrictedValue } from '../../../lib/permissions/Can';
import { usePermission } from '../../../lib/permissions/usePermission';
import { formatINR } from '../../../lib/format/money';
import {
  designsApi, jobSlipsApi, jobWorkersApi, toProblem, fmtDate, fmtQty, CHARGE_BASIS_LABEL,
  type JobSlipRecord, type ApiProblem,
} from '../../../lib/api/production';
import {
  jobReceiptsApi, reconciliationApi, type JobReceiptRecord, type ReconciliationSummary,
} from '../../../lib/api/jobwork';
import { STAGGER_CHILDREN } from '../../pageKit';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

type RowQty = Record<string, { accepted: number; rejected: number; damaged: number }>;
const applyQty = (rows: RowEntry[], q: RowQty) => rows.map(r => (q[r.key] ? { ...r, ...q[r.key] } : r));

interface RowEntry {
  key: string;
  colourId: string;
  sizeId: string;
  label: string;
  expected: number;
  already: number;
  accepted: number;
  rejected: number;
  damaged: number;
}

const RECEIVABLE = ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'];
const selectClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E40043]';
const numCls = (f: string) =>
  `w-full px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043] text-right ${
    f === 'accepted' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
  }`;

function ErrorBox({ problem }: { problem: ApiProblem | null }) {
  if (!problem) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <div>
        {problem.code && <div className="font-semibold text-xs uppercase tracking-wide mb-0.5">{problem.code.replace(/_/g, ' ')}</div>}
        {problem.detail}
      </div>
    </div>
  );
}

export function ReceivingForm() {
  const { id } = useParams<{ id: string }>();
  return id ? <ReceivingView id={id} /> : <ReceivingCreate />;
}

/* ------------------------------------------------------------------ */
/* View an existing receipt                                            */
/* ------------------------------------------------------------------ */

function ReceivingView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [rec, setRec] = useState<JobReceiptRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [askCancel, setAskCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = () => {
    setLoading(true);
    jobReceiptsApi.get(id).then(setRec).catch(e => setProblem(toProblem(e))).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const doConfirm = async () => {
    setAskConfirm(false); setBusy(true); setProblem(null);
    try { await jobReceiptsApi.confirm(id); load(); } catch (e) { setProblem(toProblem(e)); } finally { setBusy(false); }
  };
  const doCancel = async () => {
    setAskCancel(false); setBusy(true); setProblem(null);
    try { await jobReceiptsApi.cancel(id, cancelReason); load(); } catch (e) { setProblem(toProblem(e)); } finally { setBusy(false); }
  };

  if (loading) return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  if (!rec) return <div className="flex flex-col gap-4 max-w-3xl"><ErrorBox problem={problem ?? { detail: 'Receipt not found.' }} /></div>;

  const t = rec.totals;
  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/production/receiving')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">{rec.docNo}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${rec.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' : rec.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-800' : 'bg-slate-100 text-slate-500'}`}>{rec.status}</span>
          </div>
          <p className="text-sm text-slate-500 break-words">{fmtDate(rec.docDate)} · {rec.jobSlipNo} · {rec.jobWorkerName} · {rec.designNo ?? ''}</p>
        </div>
      </div>

      <ErrorBox problem={problem} />
      {(rec.warnings ?? []).map((w, i) => (
        <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {w}</div>
      ))}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: 'Received', v: t.received, c: 'text-slate-900' },
          { l: 'Accepted', v: t.accepted, c: 'text-green-700' },
          { l: 'Rejected', v: t.rejected, c: t.rejected ? 'text-red-600' : 'text-slate-400' },
          { l: 'Damaged', v: t.damaged, c: t.damaged ? 'text-red-600' : 'text-slate-400' },
        ].map(x => (
          <div key={x.l} className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
            <div className="text-xs text-slate-400">{x.l}</div>
            <div className={`text-2xl font-bold ${x.c}`}>{fmtQty(x.v)}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">By colour & size</div>
        <div className="md:hidden divide-y divide-slate-100">
          {rec.lines.map(l => (
            <div key={l._id} className="px-4 py-3 text-sm flex flex-col gap-1">
              <div className="font-medium text-slate-900">{l.colourName} / {l.sizeName}</div>
              <div className="text-xs text-slate-500">Expected {fmtQty(l.expectedQty)} · Received {fmtQty(l.receivedQty)}</div>
              <div className="text-xs"><span className="text-green-700">Accepted {fmtQty(l.acceptedQty)}</span> · <span className="text-red-600">Rejected {fmtQty(l.rejectedQty)} · Damaged {fmtQty(l.damagedQty)}</span></div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Colour', 'Size', 'Expected', 'Received', 'Accepted', 'Rejected', 'Damaged'].map(h => <th key={h} className="px-4 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rec.lines.map(l => (
                <tr key={l._id}>
                  <td className="px-4 py-2">{l.colourName}</td><td className="px-4 py-2">{l.sizeName}</td>
                  <td className="px-4 py-2">{fmtQty(l.expectedQty)}</td><td className="px-4 py-2">{fmtQty(l.receivedQty)}</td>
                  <td className="px-4 py-2 text-green-700 font-medium">{fmtQty(l.acceptedQty)}</td>
                  <td className="px-4 py-2 text-red-600">{fmtQty(l.rejectedQty)}</td><td className="px-4 py-2 text-red-600">{fmtQty(l.damagedQty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm flex flex-col gap-1">
        <RestrictedValue perm="receiving.rate.view">
          <div>Manufacturing charges: <strong>{rec.chargeOverride != null ? formatINR(rec.chargeOverride) : 'As per job slip rate'}</strong></div>
          <div>Expenses: <strong>{formatINR(rec.otherCharges ?? 0)}</strong></div>
        </RestrictedValue>
        {rec.remarks && <div className="text-slate-600">Remarks: {rec.remarks}</div>}
        {rec.cancelReason && <div className="text-slate-600">Cancelled: {rec.cancelReason}</div>}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        {rec.status === 'DRAFT' && (
          <>
            <Can perm="receiving.confirm"><Button onClick={() => setAskConfirm(true)} isLoading={busy} className="w-full sm:w-auto"><CheckCircle size={16} /> Confirm & Post</Button></Can>
            <Can perm="receiving.edit"><Button variant="outline" onClick={() => setAskCancel(true)} className="w-full sm:w-auto">Cancel Draft</Button></Can>
          </>
        )}
        <Link to={`/production/reconciliation/${rec.jobSlipId}`} className="w-full sm:w-auto">
          <Button variant="secondary" className="w-full"><Scale size={16} /> Reconciliation</Button>
        </Link>
      </div>

      <ConfirmDialog
        open={askConfirm}
        title="Confirm Receiving"
        impact={<><span className="text-green-600 font-medium">{fmtQty(t.accepted)} pcs</span> to Ready Stock{t.rejected + t.damaged > 0 && <>, <span className="text-red-500 font-medium">{fmtQty(t.rejected + t.damaged)} pcs</span> to Quarantine</>}. Material is consumed from the factory's custody as per BOM.</>}
        confirmLabel="Confirm & Post"
        onConfirm={doConfirm}
        onCancel={() => setAskConfirm(false)}
      />
      <ConfirmDialog
        open={askCancel}
        title="Cancel draft receipt"
        impact={<div className="flex flex-col gap-2">This draft will be cancelled. No stock has been posted.<input className={selectClass} placeholder="Reason (required)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></div>}
        confirmLabel="Cancel Draft"
        danger
        confirmDisabled={!cancelReason.trim()}
        onConfirm={doCancel}
        onCancel={() => setAskCancel(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New receipt                                                         */
/* ------------------------------------------------------------------ */

function ReceivingCreate() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { has } = usePermission();
  const canConfirm = has('receiving.confirm');

  const [slips, setSlips] = useState<JobSlipRecord[]>([]);
  const [names, setNames] = useState<{ designs: Map<string, string>; workers: Map<string, string> }>({ designs: new Map(), workers: new Map() });
  const [loading, setLoading] = useState(true);
  const [slipId, setSlipId] = useState(params.get('jobSlipId') ?? '');
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [rows, setRows] = useState<RowEntry[]>([]);
  const [form, setForm] = useState({ mfgCharges: '', otherCharges: '', remarks: '' });
  const [allowOver, setAllowOver] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<null | 'draft' | 'post'>(null);
  const [slipPickerOpen, setSlipPickerOpen] = useState(false);
  const [notice, setNotice] = useState('');
  /** Quantities from a restored draft, applied once the job slip's rows have loaded. */
  const restoredQty = useRef<RowQty | null>(null);

  const draftValue = useMemo(() => ({
    slipId, form, allowOver,
    qty: Object.fromEntries(rows.filter(r => r.accepted + r.rejected + r.damaged > 0).map(r => [r.key, { accepted: r.accepted, rejected: r.rejected, damaged: r.damaged }])) as RowQty,
  }), [slipId, form, allowOver, rows]);
  const draft = useDraft(`receiving:new${params.get('jobSlipId') ? `:${params.get('jobSlipId')}` : ''}`, draftValue, d => {
    if (d.slipId) setSlipId(d.slipId);
    setForm(d.form); setAllowOver(d.allowOver);
    restoredQty.current = d.qty;
    setRows(prev => applyQty(prev, d.qty));
  }, { enabled: !loading, isEmpty: d => !Object.keys(d.qty).length && !d.form.mfgCharges && !d.form.otherCharges && !d.form.remarks.trim() });

  useEffect(() => {
    Promise.all([jobSlipsApi.list({ jobType: 'MANUFACTURING' }), designsApi.list(), jobWorkersApi.list()])
      .then(([s, d, w]) => {
        setSlips(s.filter(x => x.jobType === 'MANUFACTURING' && RECEIVABLE.includes(x.status)));
        setNames({ designs: new Map(d.map(x => [x._id, `${x.designNo} — ${x.name}`])), workers: new Map(w.map(x => [x._id, x.name])) });
      })
      .catch(e => setProblem(toProblem(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setSummary(null); setRows([]);
    if (!slipId) return;
    reconciliationApi.summary(slipId)
      .then(s => {
        setSummary(s);
        const built = s.production.variants.filter(v => v.colourId && v.sizeId).map(v => ({
          key: v.key, colourId: v.colourId!, sizeId: v.sizeId!, label: v.label,
          expected: v.expected, already: v.received, accepted: 0, rejected: 0, damaged: 0,
        }));
        setRows(restoredQty.current ? applyQty(built, restoredQty.current) : built);
        restoredQty.current = null;
      })
      .catch(e => setProblem(toProblem(e)));
  }, [slipId]);

  const slip = slips.find(s => s._id === slipId);
  const update = (i: number, f: 'accepted' | 'rejected' | 'damaged', v: number) => setRows(r => r.map((row, idx) => idx === i ? { ...row, [f]: v } : row));
  const totals = useMemo(() => rows.reduce((a, r) => ({
    expected: a.expected + r.expected, already: a.already + r.already, accepted: a.accepted + r.accepted, rejected: a.rejected + r.rejected, damaged: a.damaged + r.damaged,
  }), { expected: 0, already: 0, accepted: 0, rejected: 0, damaged: 0 }), [rows]);
  const pieces = totals.accepted + totals.rejected + totals.damaged;
  const overRows = rows.filter(r => r.already + r.accepted + r.rejected + r.damaged > r.expected);

  const submit = async (post: boolean) => {
    setPending(null); setSaving(true); setProblem(null);
    try {
      const res = await submitOrQueue<JobReceiptRecord>({ method: 'POST', url: '/job-receipts', label: `Receiving · ${slip?.docNo ?? 'job slip'} · ${pieces} pcs${post ? '' : ' (draft)'}`, body: {
        jobSlipId: slipId,
        lines: rows.filter(r => r.accepted + r.rejected + r.damaged > 0).map(r => ({
          colourId: r.colourId, sizeId: r.sizeId,
          receivedQty: r.accepted + r.rejected + r.damaged, acceptedQty: r.accepted, rejectedQty: r.rejected, damagedQty: r.damaged,
        })),
        manufacturingCharges: form.mfgCharges !== '' ? Number(form.mfgCharges) : undefined,
        otherCharges: form.otherCharges !== '' ? Number(form.otherCharges) : undefined,
        remarks: form.remarks || undefined,
        allowOverReceipt: allowOver || undefined,
        confirm: post,
      } });
      draft.clear();
      if (res.queued) {
        setNotice("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/production/receiving'), 1800);
        return;
      }
      navigate(`/production/receiving/${res.data._id}`);
    } catch (e) {
      setProblem(toProblem(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const validate = (post: boolean) => {
    if (!slipId) return setProblem({ detail: 'Select a job slip.' });
    if (pieces <= 0) return setProblem({ detail: 'Enter accepted, rejected or damaged pieces on at least one row.' });
    if (overRows.length && (!allowOver || !form.remarks.trim())) {
      return setProblem({ code: 'OVER_RECEIPT', detail: `More than expected on ${overRows.map(r => r.label).join(', ')}. Correct the quantities, or tick "Accept over-receipt" and give a reason in Remarks.` });
    }
    setProblem(null);
    setPending(post ? 'post' : 'draft');
  };

  const custody = summary?.materials ?? [];

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/receiving')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">New Finished Goods Receiving</h1>
          <p className="text-sm text-slate-500">Record accepted, rejected and damaged pieces by colour and size.</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setForm({ mfgCharges: '', otherCharges: '', remarks: '' }); setAllowOver(false); setRows(prev => prev.map(r => ({ ...r, accepted: 0, rejected: 0, damaged: 0 }))); }} />
      {notice && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{notice}</p>}
      <ErrorBox problem={problem} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
        <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-3">Receiving Details</h3>
        <PickerField
          label={<span className="text-slate-700">Job Slip *</span>}
          value={slip?.docNo}
          hint={slip ? [names.workers.get(slip.jobWorkerId), names.designs.get(slip.designId)].filter(Boolean).join(' · ') : undefined}
          placeholder={loading ? 'Loading…' : slips.length ? 'Tap to choose job slip' : 'No job slips awaiting receipt'}
          disabled={loading}
          onOpen={() => setSlipPickerOpen(true)}
        />
        <PickerSheet
          open={slipPickerOpen}
          title="Choose job slip"
          items={slips.map((s): PickerItem => ({
            id: s._id,
            title: s.docNo,
            subtitle: [names.workers.get(s.jobWorkerId), names.designs.get(s.designId), fmtDate(s.docDate)].filter(Boolean).join(' · '),
            badge: s.status.replace(/_/g, ' '),
          }))}
          selectedId={slipId}
          searchPlaceholder="Search slip no., karigar or design…"
          emptyText="No job slip is waiting to be received."
          onSelect={it => { setSlipId(it.id); setProblem(null); setAllowOver(false); setSlipPickerOpen(false); }}
          onClose={() => setSlipPickerOpen(false)}
        />


        {slip && summary && (
          <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm flex flex-wrap gap-x-5 gap-y-1">
            <div><span className="text-slate-400">Factory:</span> <span className="font-medium">{summary.jobWorkerName}</span></div>
            <div><span className="text-slate-400">Design:</span> <span className="font-medium">{summary.designNo}</span></div>
            <div><span className="text-slate-400">Expected:</span> <span className="font-semibold">{fmtQty(summary.production.expected)} pcs</span></div>
            <div><span className="text-slate-400">Received so far:</span> <span className="font-semibold">{fmtQty(summary.production.received)} pcs</span></div>
            <RestrictedValue perm="receiving.rate.view">
              <span><span className="text-slate-400">Agreed:</span> <span className="font-medium">{CHARGE_BASIS_LABEL[slip.chargeBasis]} @ {formatINR(slip.agreedRate)}</span></span>
            </RestrictedValue>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Can perm="receiving.rate.view">
            <Input label="Mfg. Charges (₹) — leave blank for agreed rate" type="number" inputMode="decimal" min="0" step="0.01" value={form.mfgCharges} onChange={e => setForm(f => ({ ...f, mfgCharges: e.target.value }))} placeholder={slip && slip.chargeBasis === 'PER_PIECE' ? String(slip.agreedRate * totals.accepted) : '0.00'} />
            <Input label="Expenses (if any) — transport, etc." type="number" inputMode="decimal" min="0" step="0.01" value={form.otherCharges} onChange={e => setForm(f => ({ ...f, otherCharges: e.target.value }))} placeholder="0.00" />
          </Can>
          <Input label="Remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes" />
        </div>
      </div>

      {summary && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Quantity by Colour & Size</h3>
            <p className="text-xs text-slate-400 mt-0.5">Received = accepted + rejected + damaged.</p>
          </div>

          <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
            {rows.map((row, i) => (
              <div key={row.key} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">{row.label}</span>
                  <span className="text-xs text-slate-500">Exp {fmtQty(row.expected)} · Rcvd {fmtQty(row.already)}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(['accepted', 'rejected', 'damaged'] as const).map(f => (
                    <div key={f} className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted capitalize">{f}</label>
                      <input type="number" min="0" inputMode="numeric" className={numCls(f)} value={row[f] || ''} onChange={e => update(i, f, Math.max(0, parseInt(e.target.value) || 0))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Colour / Size', 'Expected', 'Already Rcvd', 'Accepted', 'Rejected', 'Damaged'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.key} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2">{fmtQty(row.expected)}</td>
                    <td className="px-3 py-2 text-slate-500">{fmtQty(row.already)}</td>
                    {(['accepted', 'rejected', 'damaged'] as const).map(f => (
                      <td key={f} className="px-2 py-2 w-24">
                        <input type="number" min="0" inputMode="numeric" className={numCls(f)} value={row[f] || ''} onChange={e => update(i, f, Math.max(0, parseInt(e.target.value) || 0))} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-200 font-bold">
                  <td className="px-3 py-2 text-xs text-slate-500 uppercase">Totals</td>
                  <td className="px-3 py-2">{fmtQty(totals.expected)}</td><td className="px-3 py-2">{fmtQty(totals.already)}</td>
                  <td className="px-3 py-2 text-right">{fmtQty(totals.accepted)}</td><td className="px-3 py-2 text-right">{fmtQty(totals.rejected)}</td><td className="px-3 py-2 text-right">{fmtQty(totals.damaged)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {overRows.length > 0 && (
            <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
              <input type="checkbox" className="mt-1" checked={allowOver} onChange={e => setAllowOver(e.target.checked)} />
              <span>More than expected on {overRows.map(r => r.label).join(', ')}. Tick to accept the over-receipt (a reason in Remarks is required).</span>
            </label>
          )}

          {custody.length > 0 && (
            <div className="text-xs text-slate-500 flex flex-col gap-1">
              <div className="font-semibold uppercase tracking-wide text-slate-400">Material with factory for this job</div>
              {custody.map(m => {
                const need = m.bomQtyPerGarment ? m.bomQtyPerGarment * pieces : 0;
                const short = need > m.remaining + 0.0005;
                return (
                  <div key={m.material} className={short ? 'text-red-600 font-medium' : ''}>
                    {m.material}: {fmtQty(m.remaining)} {m.uom} in custody{need > 0 && ` · this receipt uses ${fmtQty(need)} ${m.uom}`}{short && ' — not enough'}
                  </div>
                );
              })}
            </div>
          )}

          {pieces > 0 && (
            <div className="bg-[#FFF0F3] border border-[#FFB8CA] rounded-xl px-4 py-3 flex items-start gap-3">
              <Info size={15} className="text-[#E40043] shrink-0 mt-0.5" />
              <div className="text-sm text-[#8F002B]">
                After confirmation: <span className="font-semibold text-green-700">{totals.accepted} pcs → Ready Stock</span>
                {totals.rejected + totals.damaged > 0 && <>, <span className="font-semibold text-red-600">{totals.rejected + totals.damaged} pcs → Quarantine</span></>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {canConfirm && <Button type="button" onClick={() => validate(true)} isLoading={saving} disabled={!summary} className="w-full sm:w-auto">Confirm & Post</Button>}
        <Button type="button" variant={canConfirm ? 'outline' : 'primary'} onClick={() => validate(false)} isLoading={saving} disabled={!summary} className="w-full sm:w-auto">Save as Draft</Button>
        <Button type="button" variant="secondary" onClick={() => navigate('/production/receiving')} className="w-full sm:w-auto">Cancel</Button>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={pending === 'post' ? 'Confirm Receiving' : 'Save Draft'}
        impact={pending === 'post'
          ? <><span className="text-green-600 font-medium">{totals.accepted} pcs accepted</span> will move to <strong>Ready Stock</strong>.{totals.rejected + totals.damaged > 0 && <> <span className="text-red-500 font-medium">{totals.rejected + totals.damaged} pcs</span> will move to <strong>Quarantine</strong>.</>} Material is consumed from custody as per BOM. Job slip: {slip?.docNo}.</>
          : <>The receipt is saved as a draft; nothing is posted to stock until it is confirmed.</>}
        confirmLabel={pending === 'post' ? 'Confirm & Post' : 'Save Draft'}
        onConfirm={() => submit(pending === 'post')}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
