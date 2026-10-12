import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { invoicesApi, PAYMENT_MODES, apiErrorMessage, fmtDate, inr } from '../../lib/api/sales';
import { PickerField, PickerSheet, type PickerItem } from '../../components/forms/PickerSheet';
import { submitOrQueue } from '../../lib/offline/submitOrQueue';
import { useDraft } from '../../lib/drafts/useDraft';
import { DraftBanner } from '../../components/feedback/DraftBanner';
import { ErrorBanner, notifySavedOffline } from './shared';

type Pending = Awaited<ReturnType<typeof invoicesApi.pending>>[number];

export function PaymentForm() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [pending, setPending] = useState<Pending[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [invoiceId, setInvoiceId] = useState(params.get('invoiceId') ?? '');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  useEffect(() => {
    invoicesApi.pending().then(setPending).catch(e => setError(apiErrorMessage(e, 'Could not load invoices awaiting payment.'))).finally(() => setLoaded(true));
  }, []);

  // Draft: kept on this device until the payment is recorded or discarded.
  const draftValue = useMemo(() => ({ invoiceId, date, amount, mode, reference, notes }), [invoiceId, date, amount, mode, reference, notes]);
  const draft = useDraft(`payment:new${params.get('invoiceId') ? `:${params.get('invoiceId')}` : ''}`, draftValue, d => {
    setInvoiceId(d.invoiceId); setDate(d.date); setAmount(d.amount); setMode(d.mode); setReference(d.reference); setNotes(d.notes);
  }, {
    enabled: loaded,
    isEmpty: v => !v.amount && !v.reference && !v.notes && (!v.invoiceId || v.invoiceId === (params.get('invoiceId') ?? '')),
  });

  const info = pending.find(p => p.invoiceId === invoiceId);
  const over = !!info && Number(amount) > info.outstanding + 0.005;
  const invoiceItems = useMemo<PickerItem[]>(() => pending.map(p => ({
    id: p.invoiceId,
    title: `${p.docNo} — ${p.customerName}`,
    subtitle: `${fmtDate(p.docDate)} · total ${inr(p.grandTotal)}${p.paymentStatus === 'PARTIAL' ? ' · part paid' : ''}`,
    meta: inr(p.outstanding),
  })), [pending]);

  const handleSave = async () => {
    if (!info) return;
    setSaving(true);
    setError('');
    try {
      // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
      const res = await submitOrQueue({
        method: 'POST',
        url: '/payments',
        body: {
          customerId: info.customerId,
          date,
          amount: Number(amount),
          mode,
          reference: reference || undefined,
          notes: notes || undefined,
          allocations: [{ invoiceId: info.invoiceId, amount: Number(amount) }],
        },
        label: `Payment · ${info.customerName} · ${inr(Number(amount))} against ${info.docNo}`,
      });
      draft.clear();
      if (res.queued) notifySavedOffline('this payment');
      navigate(`/sales/invoices/${info.invoiceId}`);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not record the payment.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/sales/payments')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Record Payment</h1>
          <p className="text-sm text-slate-500">Record a customer payment against an invoice.</p>
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-4">
        <div>
          <PickerField
            label={<span className="block text-xs font-medium text-slate-600">Invoice No. *</span>}
            value={info ? `${info.docNo} — ${info.customerName}` : undefined}
            hint={info ? `Balance ${inr(info.outstanding)}` : undefined}
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
            loading={!loaded}
            searchPlaceholder="Invoice no. or customer…"
            emptyText="No invoice with a balance due matches."
            onCreate={() => { setPickerOpen(false); navigate('/sales/invoices/new'); }}
            createLabel="invoice"
          />
          {params.get('invoiceId') && pending.length > 0 && !info && <p className="text-xs text-slate-500 mt-1">That invoice has nothing outstanding.</p>}
        </div>

        {info && (
          <div className="bg-[#FFF0F3] border border-[#FFB8CA] rounded-lg px-4 py-3 text-sm">
            <div className="flex justify-between gap-3"><span className="text-[#B80037]">Invoice Total ({fmtDate(info.docDate)})</span><span className="font-semibold text-[#5E001C] text-right">{inr(info.grandTotal)}</span></div>
            <div className="flex justify-between gap-3 mt-1"><span className="text-[#B80037]">Paid so far</span><span className="text-[#5E001C]">{inr(info.allocated)}</span></div>
            {info.credited > 0 && <div className="flex justify-between gap-3 mt-1"><span className="text-[#B80037]">Credit notes</span><span className="text-[#5E001C]">{inr(info.credited)}</span></div>}
            <div className="flex justify-between gap-3 mt-1"><span className="text-[#B80037]">Outstanding Balance</span><span className="font-bold text-[#5E001C]">{inr(info.outstanding)}</span></div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Payment Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Amount *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">₹</span>
              <input type="number" inputMode="decimal" min={0} value={amount} onChange={e => setAmount(e.target.value)} placeholder={info ? String(info.outstanding) : '0'}
                className="w-full pl-7 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
            </div>
            {info && <button type="button" onClick={() => setAmount(String(info.outstanding))} className="text-xs text-[#E40043] mt-1">Pay full balance</button>}
            {over && <div className="text-xs text-red-600 mt-1">Exceeds outstanding balance</div>}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Payment Mode *</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PAYMENT_MODES.map(m => (
              <button key={m.value} type="button" onClick={() => setMode(m.value)}
                className={`min-h-[40px] px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${mode === m.value ? 'border-[#E40043] bg-[#FFF0F3] text-[#B80037]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Reference / Cheque No.</label>
          <input type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="NEFT/UTR, cheque number, UPI ref…"
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043] resize-none" />
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <button onClick={() => navigate('/sales/payments')} className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <button onClick={handleSave} disabled={!info || !amount || Number(amount) <= 0 || !date || saving || over}
          className="w-full sm:w-auto min-h-[40px] flex items-center justify-center gap-2 px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50">
          <CheckCircle size={15} /> {saving ? 'Saving…' : 'Record Payment'}
        </button>
      </div>
    </div>
  );
}
