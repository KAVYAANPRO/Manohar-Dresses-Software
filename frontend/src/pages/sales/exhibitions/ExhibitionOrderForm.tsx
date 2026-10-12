import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, FileText, ClipboardList } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { exhibitionsApi, PAYMENT_MODES, modeLabel, apiErrorMessage, fmtDate, inr, type ExhibitionRow, type SellableItem } from '../../../lib/api/sales';
import { CustomerPickerField, ErrorBanner, Spinner, StatePickerField, VariantPicker, notifySavedOffline, useCustomers, useSellableItems } from '../shared';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

interface Line { id: string; designVariantId: string; item: SellableItem | null; qty: number; rate: number }
let lineId = 1;

function ExhibitionView({ id }: { id: string }) {
  const navigate = useNavigate();
  const { customers, add: addCustomer } = useCustomers();
  const [o, setO] = useState<ExhibitionRow | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState('');

  const load = () => exhibitionsApi.get(id).then(setO).catch(e => setError(apiErrorMessage(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const convert = async (target: 'SALES_ORDER' | 'INVOICE') => {
    setBusy(true); setError(''); setInfo('');
    try {
      const r = await exhibitionsApi.convert(id, target, customerId);
      if (r.invoice) { navigate(`/sales/invoices/${r.invoice._id}`); return; }
      if (r.confirmError) setInfo(`Sales order ${r.salesOrder?.docNo} created as a draft: ${r.confirmError}`);
      await load();
    } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (!o) return error ? <div className="p-6"><ErrorBanner message={error} /></div> : <Spinner />;
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/sales/exhibition-orders')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 break-all">{o.docNo}</h1>
          <p className="text-sm text-slate-500">{o.exhibitionName}{o.location ? `, ${o.location}` : ''} · {fmtDate(o.docDate)}</p>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${o.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : o.status === 'CONVERTED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {o.status === 'PENDING' ? 'Pending' : o.status === 'CONVERTED' ? 'Completed' : 'Cancelled'}
        </span>
      </div>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {info && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">{info}</div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 grid grid-cols-2 gap-3 text-sm">
        <div><div className="text-xs text-muted">Customer</div><div className="font-medium">{o.customerName}</div></div>
        <div><div className="text-xs text-muted">Mobile</div><div>{o.mobile ?? '—'}</div></div>
        <div><div className="text-xs text-muted">Order value</div><div className="font-semibold">{inr(o.totalAmount)}</div></div>
        <div><div className="text-xs text-muted">Collected</div><div className="text-green-700 font-semibold">{inr(o.amountCollected)}{o.paymentMode ? ` (${modeLabel(o.paymentMode)})` : ''}</div></div>
        <div><div className="text-xs text-muted">Balance</div><div className="text-red-600 font-semibold">{inr(o.balance)}</div></div>
        {o.invoiceId && <div><div className="text-xs text-muted">Invoice</div><Link className="text-[#E40043]" to={`/sales/invoices/${o.invoiceId}`}>{o.invoiceNo}</Link></div>}
        {o.salesOrderId && <div><div className="text-xs text-muted">Sales order</div><Link className="text-[#E40043]" to={`/sales/orders/${o.salesOrderId}`}>{o.salesOrderNo}</Link></div>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {o.lines.map(l => (
          <div key={l._id} className="px-4 py-3 flex justify-between gap-2 text-sm">
            <span>{l.designNo} / {l.colourName} / {l.sizeName}</span>
            <span>{l.qty} × {inr(l.unitRate)}{l.discountPct ? ` −${l.discountPct}%` : ''}</span>
          </div>
        ))}
      </div>

      {o.status === 'PENDING' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3">
          <div className="text-sm font-semibold text-slate-700">Convert</div>
          <CustomerPickerField
            label={<span className="block text-xs font-medium text-slate-600">Bill to customer</span>}
            customers={customers}
            value={customerId}
            onChange={c => setCustomerId(c?._id ?? '')}
            onAdded={addCustomer}
            noneLabel={o.customerId ? 'Linked customer' : `Find by mobile or create "${o.customerName}"`}
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <Can perm="invoices.confirm">
              <button disabled={busy} onClick={() => convert('INVOICE')} className="min-h-[40px] px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"><FileText size={15} /> Invoice now (deduct stock)</button>
            </Can>
            <Can perm="salesorders.confirm">
              <button disabled={busy} onClick={() => convert('SALES_ORDER')} className="min-h-[40px] px-4 py-2 bg-[#E40043] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"><ClipboardList size={15} /> Convert to Sales Order</button>
            </Can>
            <Can perm="salesorders.cancel">
              <button disabled={busy} onClick={async () => { setBusy(true); try { await exhibitionsApi.cancel(id, 'Cancelled by user'); await load(); } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); } }}
                className="min-h-[40px] px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm">Cancel Order</button>
            </Can>
          </div>
          <p className="text-xs text-slate-500">The amount collected is recorded as a receipt — applied to the invoice, or kept as an advance on the sales order.</p>
        </div>
      )}
    </div>
  );
}

export function ExhibitionOrderForm() {
  const { id } = useParams<{ id: string }>();
  if (id) return <ExhibitionView id={id} />;
  return <NewExhibitionOrder />;
}

function NewExhibitionOrder() {
  const navigate = useNavigate();
  const { items, reload: reloadItems } = useSellableItems();
  const [exhibitionName, setExhibitionName] = useState('');
  const [location, setLocation] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [state, setState] = useState('');
  const [amountCollected, setAmountCollected] = useState(0);
  const [paymentMode, setPaymentMode] = useState('CASH');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addLine = () => setLines(p => [...p, { id: String(lineId++), designVariantId: '', item: null, qty: 0, rate: 0 }]);
  const updateLine = (id: string, patch: Partial<Line>) => setLines(p => p.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines(p => p.filter(l => l.id !== id));
  const total = lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const balance = total - amountCollected;
  const invalid = !exhibitionName.trim() || !customerName.trim() || lines.length === 0 || lines.some(l => !l.designVariantId || l.qty <= 0) || amountCollected > total;

  // Draft: kept on this device until the order is saved or discarded.
  const draftValue = useMemo(
    () => ({ exhibitionName, location, customerName, mobileNumber, state, amountCollected, paymentMode, lines }),
    [exhibitionName, location, customerName, mobileNumber, state, amountCollected, paymentMode, lines],
  );
  const draft = useDraft('exhibition-order:new', draftValue, d => {
    setExhibitionName(d.exhibitionName); setLocation(d.location); setCustomerName(d.customerName); setMobileNumber(d.mobileNumber);
    setState(d.state); setAmountCollected(d.amountCollected); setPaymentMode(d.paymentMode); setLines(d.lines);
    lineId = Math.max(lineId, ...d.lines.map(l => Number(l.id) + 1));
  }, {
    isEmpty: v => !v.exhibitionName && !v.location && !v.customerName && !v.mobileNumber && !v.amountCollected && v.lines.every(l => !l.designVariantId && !l.qty),
  });
  // Refresh stock figures on restored lines once the live product list is in.
  useEffect(() => {
    if (!items.length) return;
    setLines(p => p.map(l => (l.designVariantId ? { ...l, item: items.find(i => i.designVariantId === l.designVariantId) ?? l.item } : l)));
  }, [items, draft.restoredAt]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
      const res = await submitOrQueue<ExhibitionRow>({
        method: 'POST',
        url: '/exhibition-orders',
        body: {
          exhibitionName, location: location || undefined, customerName, mobile: mobileNumber || undefined, state: state || undefined,
          amountCollected: amountCollected || undefined, paymentMode: amountCollected ? paymentMode : undefined,
          lines: lines.map(l => ({ designVariantId: l.designVariantId, qty: l.qty, unitRate: l.rate })),
        },
        label: `Exhibition order · ${customerName} · ${exhibitionName} · ${lines.reduce((s, l) => s + l.qty, 0)} pcs`,
      });
      draft.clear();
      if (res.queued) {
        notifySavedOffline('this exhibition order');
        navigate('/sales/exhibition-orders');
      } else {
        navigate(`/sales/exhibition-orders/${res.data._id}`);
      }
    } catch (e) { setError(apiErrorMessage(e, 'Could not save the order.')); } finally { setSaving(false); }
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/sales/exhibition-orders')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">New Exhibition Order</h1>
          <p className="text-sm text-slate-500">For orders taken at an exhibition or pop-up, often to a walk-in customer. No stock moves until it is converted.</p>
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div><label className={labelClass}>Exhibition Name *</label><input className={inputClass} value={exhibitionName} onChange={e => setExhibitionName(e.target.value)} placeholder="e.g. Surat Textile Expo" /></div>
        <div><label className={labelClass}>Location</label><input className={inputClass} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Surat" /></div>
        <div><label className={labelClass}>Date</label><input className="w-full px-3 py-2 text-sm border border-slate-100 bg-slate-50 rounded-lg text-slate-600" value={new Date().toLocaleDateString('en-GB').split('/').join('-')} disabled /></div>
        <div><label className={labelClass}>Customer Name *</label><input className={inputClass} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in name, or an existing customer's name" /></div>
        <div><label className={labelClass}>Mobile Number</label><input type="tel" inputMode="numeric" className={inputClass} value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="10 digits (optional)" /></div>
        <StatePickerField
          label={<span className="block text-xs font-medium text-slate-600">Customer State</span>}
          value={state}
          onChange={setState}
          noneLabel="Same as company (default)"
        />
        <div><label className={labelClass}>Amount Collected (₹)</label><input type="number" inputMode="decimal" min={0} className={inputClass} value={amountCollected || ''} onChange={e => setAmountCollected(Number(e.target.value) || 0)} placeholder="0" /></div>
        <ChoiceChips
          className="md:col-span-3"
          label={<span className="block text-xs font-medium text-slate-600">Collected via</span>}
          value={paymentMode}
          options={PAYMENT_MODES.map(m => ({ value: m.value as string, label: m.label as string }))}
          onChange={setPaymentMode}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-2 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items</span>
          <button onClick={addLine} className="flex items-center gap-1.5 min-h-[40px] px-2 -mr-2 text-sm text-[#E40043] font-medium hover:text-[#8F002B]"><Plus size={14} /> Add Line</button>
        </div>
        {lines.length === 0 ? <div className="px-5 py-8 text-center text-slate-400 text-sm">No items yet.</div> : (
          <div className="flex flex-col gap-3 p-3">
            {lines.map((l, idx) => (
              <div key={l.id} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-700">Item {idx + 1}</span>
                  <button onClick={() => removeLine(l.id)} aria-label="Remove line" className="flex items-center justify-center w-10 h-10 -mr-2 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                </div>
                <VariantPicker items={items} value={l.designVariantId} onChange={it => updateLine(l.id, { item: it, designVariantId: it?.designVariantId ?? '', rate: it?.defaultSellingRate ?? 0 })} onReload={reloadItems} />
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="block text-xs font-medium text-muted mb-1">Qty</label><input type="number" inputMode="numeric" min={0} className={inputClass} value={l.qty || ''} onChange={e => updateLine(l.id, { qty: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1">Rate (₹)</label><input type="number" inputMode="decimal" min={0} className={inputClass} value={l.rate || ''} onChange={e => updateLine(l.id, { rate: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1">Amount</label><div className="py-2 text-sm font-medium">{inr(l.qty * l.rate)}</div></div>
                </div>
              </div>
            ))}
            <div className="flex flex-col gap-1 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Total (before GST)</span><span className="font-bold text-slate-900">{inr(total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Collected</span><span className="font-semibold text-green-700">{inr(amountCollected)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Balance</span><span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-slate-400'}`}>{inr(balance)}</span></div>
              <p className="text-xs text-slate-400">GST is added when it is invoiced.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleSave} disabled={invalid || saving} className="w-full sm:w-auto min-h-[40px] px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
          {saving ? 'Saving…' : 'Save Order'}
        </button>
        <button onClick={() => navigate('/sales/exhibition-orders')} className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
      </div>
    </div>
  );
}
