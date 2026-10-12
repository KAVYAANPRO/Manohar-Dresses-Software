import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { invoicesApi, salesReturnsApi, apiErrorMessage, fmtDate, inr, type InvoiceRow, type InvoiceView, type SalesReturnRow } from '../../../lib/api/sales';
import { ErrorBanner, Spinner, notifySavedOffline } from '../shared';
import { PickerField, PickerSheet, type PickerItem } from '../../../components/forms/PickerSheet';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

interface LineState { qty: string; condition: 'GOOD' | 'DAMAGED' }

export function SalesReturnForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // view mode
  const [ret, setRet] = useState<SalesReturnRow | null>(null);
  // create mode
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoiceId, setInvoiceId] = useState(params.get('invoiceId') ?? '');
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<Record<string, LineState>>({});
  const [loading, setLoading] = useState(true);

  const loadReturn = () => {
    if (!id) return;
    salesReturnsApi.get(id).then(setRet).catch(e => setError(apiErrorMessage(e))).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (id) { loadReturn(); return; }
    invoicesApi.list({ status: 'CONFIRMED' })
      .then(setInvoices)
      .catch(e => setError(apiErrorMessage(e, 'Could not load invoices.')))
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Line quantities from a restored draft, applied once its invoice has loaded. */
  const restoredLines = useRef<Record<string, LineState> | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  useEffect(() => {
    if (!invoiceId || id) { setInvoice(null); return; }
    invoicesApi.get(invoiceId)
      .then(inv => {
        setInvoice(inv);
        const keep = restoredLines.current;
        restoredLines.current = null;
        setState(Object.fromEntries(inv.lines.map(l => [l._id, keep?.[l._id] ?? { qty: '', condition: 'GOOD' as const }])));
      })
      .catch(e => setError(apiErrorMessage(e)));
  }, [invoiceId, id]);

  // Draft (create mode only): kept on this device until the return is saved or discarded.
  const draftValue = useMemo(() => ({ invoiceId, reason, state }), [invoiceId, reason, state]);
  const draft = useDraft(`sales-return:new${params.get('invoiceId') ? `:${params.get('invoiceId')}` : ''}`, draftValue, d => {
    restoredLines.current = d.state;
    setInvoiceId(d.invoiceId); setReason(d.reason);
    if (d.invoiceId === invoiceId && invoice) setState(d.state);
  }, {
    enabled: !id && !loading,
    isEmpty: v => !v.reason && Object.values(v.state).every(s => !s.qty) && (!v.invoiceId || v.invoiceId === (params.get('invoiceId') ?? '')),
  });
  const invoiceItems = useMemo<PickerItem[]>(() => invoices.map(i => ({
    id: i._id,
    title: `${i.docNo} — ${i.customerName}`,
    subtitle: `${fmtDate(i.docDate)} · ${i.totalQty} pcs`,
    meta: inr(i.grandTotal),
  })), [invoices]);

  const selected = invoice ? invoice.lines.filter(l => Number(state[l._id]?.qty) > 0) : [];
  const overAny = invoice ? invoice.lines.some(l => Number(state[l._id]?.qty) > l.returnableQty) : false;
  const estimate = invoice
    ? selected.reduce((s, l) => s + (l.lineTotal / l.qty) * Number(state[l._id].qty), 0)
    : 0;

  const save = async (confirm: boolean) => {
    if (!invoice) return;
    setSaving(true); setError('');
    try {
      // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
      const res = await submitOrQueue<SalesReturnRow>({
        method: 'POST',
        url: '/sales-returns',
        body: {
          invoiceId: invoice._id,
          reason,
          confirm,
          lines: selected.map(l => ({ invoiceLineId: l._id, qty: Number(state[l._id].qty), condition: state[l._id].condition })),
        },
        label: `Sales return · ${invoice.customerName} · ${invoice.docNo} · ${selected.reduce((s, l) => s + Number(state[l._id].qty), 0)} pcs`,
      });
      draft.clear();
      if (res.queued) {
        notifySavedOffline('this sales return');
        navigate('/sales/returns');
      } else {
        navigate(`/sales/returns/${res.data._id}`);
      }
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not save the return.'));
    } finally { setSaving(false); }
  };

  const act = async (kind: 'confirm' | 'cancel') => {
    if (!ret) return;
    setSaving(true); setError('');
    try {
      if (kind === 'confirm') await salesReturnsApi.confirm(ret._id);
      else await salesReturnsApi.cancel(ret._id, 'Draft discarded');
      loadReturn();
    } catch (e) { setError(apiErrorMessage(e)); } finally { setSaving(false); }
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';

  if (loading) return <Spinner />;

  if (id) {
    if (!ret) return <div className="p-6"><ErrorBanner message={error || 'Sales return not found.'} /></div>;
    return (
      <div className="flex flex-col gap-6 max-w-3xl">
        <div className="flex items-start gap-3 flex-wrap">
          <button onClick={() => navigate('/sales/returns')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 break-all">{ret.docNo}</h1>
            <p className="text-sm text-slate-500">{ret.customerName} · {fmtDate(ret.docDate)} · Invoice <Link className="text-[#E40043]" to={`/sales/invoices/${ret.invoiceId}`}>{ret.invoiceNo}</Link></p>
          </div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${ret.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' : ret.status === 'DRAFT' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
            {ret.status === 'CONFIRMED' ? 'Credited' : ret.status === 'DRAFT' ? 'Pending' : 'Cancelled'}
          </span>
        </div>
        <ErrorBanner message={error} onClose={() => setError('')} />
        {ret.status === 'CONFIRMED' && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            Credit note <strong>{ret.creditNoteNo}</strong> issued for {inr(ret.creditTotal)}; it reduces the invoice's outstanding balance. Good pieces went back to ready stock, damaged pieces to Quarantine.
          </div>
        )}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm"><span className="font-medium">Reason: </span>{ret.reason}</div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {ret.lines.map(l => (
              <div key={l._id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0"><div className="font-medium text-slate-900">{l.designNo} / {l.colourName} / {l.sizeName}</div>
                  <div className="text-xs text-slate-500">{l.qty} pcs · {l.condition === 'GOOD' ? 'Good → Ready stock' : 'Damaged → Quarantine'}</div></div>
                <div className="text-right"><div className="font-semibold">{inr(l.lineTotal)}</div><div className="text-xs text-slate-400">taxable {inr(l.taxableValue)} + GST {inr(l.cgst + l.sgst + l.igst)}</div></div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex flex-col items-end gap-1 text-sm">
            <div>Taxable {inr(ret.taxableTotal)} · GST {inr(ret.taxTotal)}{ret.roundOff ? ` · Round off ${inr(ret.roundOff)}` : ''}</div>
            <div className="font-bold text-base">Credit Note Amount {inr(ret.creditTotal)}</div>
          </div>
        </div>
        {ret.status === 'DRAFT' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Can perm="invoices.confirm">
              <button onClick={() => act('confirm')} disabled={saving} className="w-full sm:w-auto min-h-[40px] px-6 py-2 bg-[#E40043] text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                <CheckCircle size={15} /> Confirm & Issue Credit Note
              </button>
            </Can>
            <button onClick={() => act('cancel')} disabled={saving} className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-red-200 text-red-600 rounded-lg text-sm">Discard Draft</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/sales/returns')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">New Sales Return</h1>
          <p className="text-sm text-slate-500">Goods returned against an invoice. Good pieces go back to ready stock, damaged ones to Quarantine; a credit note reduces the invoice balance.</p>
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <PickerField
            label={<span className={labelClass}>Invoice *</span>}
            value={invoice ? `${invoice.docNo} — ${invoice.customerName}` : invoices.find(i => i._id === invoiceId)?.docNo}
            hint={invoice ? fmtDate(invoice.docDate) : undefined}
            placeholder="Tap to choose invoice"
            onOpen={() => setPickerOpen(true)}
          />
          <PickerSheet
            open={pickerOpen}
            title="Choose invoice"
            items={invoiceItems}
            selectedId={invoiceId}
            onSelect={it => { setInvoiceId(it.id); setPickerOpen(false); }}
            onClose={closePicker}
            searchPlaceholder="Invoice no. or customer…"
            emptyText="No confirmed invoice matches."
          />
        </div>
        <div>
          <label className={labelClass}>Customer</label>
          <input className="w-full px-3 py-2 text-sm border border-slate-100 bg-slate-50 rounded-lg text-slate-600" value={invoice?.customerName ?? ''} disabled />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Reason *</label>
          <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Size mismatch, damaged in transit..." />
        </div>
      </div>

      {invoice && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 md:px-5 py-3 border-b border-slate-100"><span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Returned Items</span></div>
          <div className="flex flex-col divide-y divide-slate-100">
            {invoice.lines.map(l => {
              const st = state[l._id] ?? { qty: '', condition: 'GOOD' };
              const over = Number(st.qty) > l.returnableQty;
              return (
                <div key={l._id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900">{l.designNo} / {l.colourName} / {l.sizeName}</div>
                    <div className="text-xs text-slate-500">Invoiced {l.qty} · Already returned {l.returnedQty} · Returnable {l.returnableQty} · {inr(l.lineTotal / l.qty)}/pc incl. GST</div>
                  </div>
                  <div className="grid grid-cols-[5.5rem_1fr] gap-2 md:w-80">
                    <div>
                      <label className="block text-xs font-medium text-muted mb-1">Qty</label>
                      <input type="number" inputMode="numeric" min={0} max={l.returnableQty} disabled={l.returnableQty <= 0} value={st.qty}
                        onChange={e => setState(p => ({ ...p, [l._id]: { ...st, qty: e.target.value } }))}
                        className={`${inputClass} ${over ? 'border-red-400 bg-red-50' : ''}`} />
                      {over && <div className="text-xs text-red-600">Max {l.returnableQty}</div>}
                    </div>
                    <ChoiceChips
                      label={<span className="block text-xs font-medium text-muted">Condition</span>}
                      value={st.condition}
                      options={[{ value: 'GOOD', label: 'Good → Ready' }, { value: 'DAMAGED', label: 'Damaged' }]}
                      onChange={v => setState(p => ({ ...p, [l._id]: { ...st, condition: v } }))}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between p-4 bg-slate-50 border-t border-slate-200 text-sm"><span className="font-bold text-slate-700">Credit Note Amount (approx.)</span><span className="font-bold text-slate-900">{inr(Math.round(estimate))}</span></div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <Can perm="invoices.confirm">
          <button onClick={() => save(true)} disabled={!invoice || selected.length === 0 || !reason.trim() || overAny || saving}
            className="w-full sm:w-auto min-h-[40px] px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Save & Issue Credit Note'}
          </button>
        </Can>
        <button onClick={() => save(false)} disabled={!invoice || selected.length === 0 || !reason.trim() || overAny || saving}
          className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-60">Save as Pending</button>
        <button onClick={() => navigate('/sales/returns')} className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
      </div>
    </div>
  );
}
