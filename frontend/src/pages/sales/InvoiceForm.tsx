import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText, Plus, Trash2, CheckCircle } from 'lucide-react';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { Can } from '../../lib/permissions/Can';
import { salesOrdersApi, apiErrorMessage, inr, customerLabel, variantText, type InvoiceView, type SalesOrderView, type SellableItem } from '../../lib/api/sales';
import { submitOrQueue } from '../../lib/offline/submitOrQueue';
import { useDraft } from '../../lib/drafts/useDraft';
import { DraftBanner } from '../../components/feedback/DraftBanner';
import { CustomerPickerField, ErrorBanner, Spinner, VariantPicker, notifySavedOffline, useCustomers, usePricePreview, useSellableItems } from './shared';
import { STAGGER_CHILDREN } from '../pageKit';

interface FormLine {
  key: string;
  salesOrderLineId?: string;
  designVariantId: string;
  item: SellableItem | null;
  maxQty?: number;
  qty: number;
  rate: number;
  discountPct: number;
  extraDiscountPct?: number;
}

let k = 1;

export function InvoiceForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const soId = searchParams.get('soId');
  const { items, loading: itemsLoading, reload: reloadItems } = useSellableItems();
  const { customers, loaded: customersLoaded, add: addCustomer } = useCustomers();

  const [isLoading, setIsLoading] = useState(!!soId);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ id: string; docNo: string; total: number } | null>(null);
  const [so, setSo] = useState<SalesOrderView | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<FormLine[]>([]);
  const [notes, setNotes] = useState('');
  const [expenses, setExpenses] = useState('0');

  useEffect(() => {
    if (!soId) return;
    salesOrdersApi.get(soId)
      .then(o => {
        setSo(o);
        setCustomerId(o.customerId);
        setLines(o.lines.filter(l => l.pendingQty > 0).map(l => ({
          key: String(k++), salesOrderLineId: l._id, designVariantId: l.designVariantId, item: null,
          maxQty: l.pendingQty, qty: l.pendingQty, rate: l.unitRate, discountPct: l.discountPct, extraDiscountPct: l.extraDiscountPct,
        })));
        // Order-level charges travel on the first invoice of the order only.
        const firstInvoice = !o.invoices.some(i => i.status === 'CONFIRMED');
        setExpenses(String(firstInvoice ? (o.shippingCharge ?? 0) + (o.otherCharges ?? 0) : 0));
        if (o.notes) setNotes(o.notes);
      })
      .catch(e => setError(apiErrorMessage(e, 'Could not load the sales order.')))
      .finally(() => setIsLoading(false));
  }, [soId]);

  // Draft (direct invoices only - one raised from a sales order is rebuilt from the order).
  const draftValue = useMemo(() => ({ customerId, lines, notes, expenses }), [customerId, lines, notes, expenses]);
  const draft = useDraft('invoice:new', draftValue, d => {
    setCustomerId(d.customerId); setLines(d.lines); setNotes(d.notes); setExpenses(d.expenses);
    k = Math.max(k, ...d.lines.map(l => Number(l.key) + 1));
  }, {
    enabled: !soId && customersLoaded,
    isEmpty: v => !v.customerId && !v.notes && v.lines.every(l => !l.designVariantId && !l.qty),
  });

  // Attach live stock info once both the order and the item list are loaded (and after a draft restore).
  useEffect(() => {
    if (items.length === 0) return;
    setLines(prev => prev.map(l => ({ ...l, item: items.find(i => i.designVariantId === l.designVariantId) ?? l.item })));
  }, [items, so, draft.restoredAt]);

  const customer = customers.find(c => c._id === customerId);
  const otherCharges = Number(expenses) || 0;
  const { preview, error: priceError, lineAt } = usePricePreview(
    customerId,
    lines.map(l => ({ designVariantId: l.designVariantId, qty: l.qty, unitRate: l.rate || undefined, discountPct: l.discountPct, extraDiscountPct: l.extraDiscountPct || undefined })),
    otherCharges,
  );
  const isSameState = preview?.isIntraState ?? true;

  const updateLine = (key: string, patch: Partial<FormLine>) => setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines(prev => [...prev, { key: String(k++), designVariantId: '', item: null, qty: 0, rate: 0, discountPct: customer?.defaultDiscountPct ?? 0 }]);

  const invalid = !customerId || lines.length === 0 || lines.some(l => !l.designVariantId || l.qty <= 0 || (l.maxQty !== undefined && l.qty > l.maxQty));
  const totalPieces = lines.reduce((s, l) => s + l.qty, 0);
  const designSummary = lines.map(l => `${l.qty} × ${l.item ? variantText(l.item) : '…'}`).join(', ');

  const body = (confirm: boolean) => ({
    customerId,
    salesOrderId: so?._id,
    notes: notes || undefined,
    otherCharges: otherCharges || undefined,
    lines: lines.map(l => ({
      salesOrderLineId: l.salesOrderLineId,
      designVariantId: l.designVariantId,
      qty: l.qty,
      unitRate: l.rate,
      discountPct: l.discountPct,
      extraDiscountPct: l.extraDiscountPct || undefined,
    })),
    confirm,
  });

  const save = async (confirm: boolean) => {
    setShowConfirm(false);
    setIsSaving(true);
    setError('');
    try {
      // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
      const res = await submitOrQueue<InvoiceView>({
        method: 'POST',
        url: '/invoices',
        body: body(confirm),
        label: `Invoice · ${customerLabel(customer) || so?.customer?.name || 'customer'}${so ? ` · ${so.docNo}` : ''} · ${totalPieces} pcs`,
      });
      if (!soId) draft.clear();
      if (res.queued) {
        notifySavedOffline('this invoice');
        navigate(so ? `/sales/orders/${so._id}` : '/sales/invoices');
        return;
      }
      const inv = res.data;
      if (confirm && inv.status === 'CONFIRMED') setDone({ id: inv._id, docNo: inv.docNo, total: inv.grandTotal });
      else navigate(`/sales/invoices/${inv._id}`);
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not create the invoice.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); setShowConfirm(true); };

  if (isLoading || (soId && itemsLoading)) return <Spinner />;

  if (done) {
    return (
      <div className="max-w-xl mx-auto mt-6 bg-green-50 border border-green-200 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
        <CheckCircle size={44} className="text-green-600" />
        <h1 className="text-xl font-bold text-green-900">Invoice {done.docNo} confirmed</h1>
        <p className="text-sm text-green-800">{totalPieces} pieces were deducted from ready stock. Invoice total {inr(done.total)}.</p>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button onClick={() => navigate(`/sales/invoices/${done.id}`)} className="min-h-[40px] px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium">View Invoice</button>
          <button onClick={() => navigate(`/sales/payments/new?invoiceId=${done.id}`)} className="min-h-[40px] px-5 py-2 border border-green-300 text-green-800 rounded-lg text-sm font-medium">Record Payment</button>
        </div>
      </div>
    );
  }

  const taxHeaders = isSameState ? ['CGST', 'SGST'] : ['IGST'];

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(so ? `/sales/orders/${so._id}` : '/sales/invoices')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">Create Invoice</h1>
          {so ? <p className="text-sm text-slate-500">From Sales Order: <span className="font-medium text-[#E40043]">{so.docNo}</span></p> : <p className="text-sm text-slate-500">Direct invoice from ready stock.</p>}
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><FileText size={15} className="text-[#E40043]" /> Invoice Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer <span className="text-red-500">*</span></label>
              {so ? (
                <input type="text" value={so.customer?.name ?? ''} disabled className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600" />
              ) : (
                <CustomerPickerField
                  label={null}
                  customers={customers}
                  value={customerId}
                  onChange={c => { setCustomerId(c?._id ?? ''); setLines(p => p.map(l => ({ ...l, discountPct: c?.defaultDiscountPct ?? 0 }))); }}
                  onAdded={addCustomer}
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer GSTIN</label>
              <input type="text" value={customer?.gstin ?? so?.customer?.gstin ?? ''} disabled className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 font-mono" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Invoice Date</label>
              <input type="text" value="Set on confirmation (today)" disabled className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Place of Supply</label>
              <input type="text" value={customer?.state ?? so?.customer?.state ?? ''} disabled placeholder="From the customer master"
                className="w-full border border-slate-100 bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600" />
            </div>
          </div>
          {customerId && (
            <div className="mt-3 p-3 bg-[#FFF0F3] rounded-lg text-xs text-[#B80037]">
              {isSameState ? 'Same-state supply → CGST + SGST applicable' : 'Inter-state supply → IGST applicable'}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Invoice Lines</h2>
            {!so && <button type="button" onClick={addLine} className="flex items-center gap-1.5 min-h-[40px] px-2 text-sm text-[#E40043] font-medium"><Plus size={14} /> Add Line</button>}
          </div>
          {lines.length === 0 ? (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">{so ? 'Nothing left to invoice on this order.' : 'No lines yet. Click "Add Line".'}</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {['Design / Colour / Size', 'Avail.', 'Qty', 'Rate', 'Disc %', 'Taxable', 'HSN', 'GST %', ...taxHeaders, 'Line Total', ''].map(h => (
                        <th key={h || 'x'} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lines.map((l, idx) => {
                      const p = lineAt(idx);
                      const over = l.maxQty !== undefined && l.qty > l.maxQty;
                      return (
                        <tr key={l.key} className="hover:bg-slate-50">
                          <td className="px-3 py-3 font-medium">
                            {so ? (l.item ? variantText(l.item) : '…') : <VariantPicker compact items={items} value={l.designVariantId} onChange={it => updateLine(l.key, { item: it, designVariantId: it?.designVariantId ?? '', rate: it?.defaultSellingRate ?? 0 })} onReload={reloadItems} />}
                          </td>
                          <td className="px-3 py-3 text-xs text-slate-500">{l.item ? l.item.onHand : '—'}</td>
                          <td className="px-3 py-3">
                            <input type="number" inputMode="numeric" min={0} max={l.maxQty} value={l.qty || ''} onChange={e => updateLine(l.key, { qty: Number(e.target.value) })}
                              className={`w-16 px-2 py-1.5 text-xs border rounded ${over ? 'border-red-400 bg-red-50' : 'border-slate-200'}`} />
                            {l.maxQty !== undefined && <div className="text-[10px] text-slate-400">max {l.maxQty}</div>}
                          </td>
                          <td className="px-3 py-3">
                            {so ? inr(l.rate) : <input type="number" inputMode="decimal" min={0} value={l.rate || ''} onChange={e => updateLine(l.key, { rate: Number(e.target.value) })} className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded" />}
                          </td>
                          <td className="px-3 py-3">
                            {so ? `${l.discountPct}%` : <input type="number" inputMode="decimal" min={0} max={100} value={l.discountPct || ''} onChange={e => updateLine(l.key, { discountPct: Number(e.target.value) })} className="w-14 px-2 py-1.5 text-xs border border-slate-200 rounded" />}
                          </td>
                          <td className="px-3 py-3 text-right">{p ? inr(p.taxableValue) : '—'}</td>
                          <td className="px-3 py-3 text-slate-500 text-xs">{p?.hsn ?? l.item?.hsn ?? '—'}</td>
                          <td className="px-3 py-3 text-right">{p ? `${p.taxRatePct}%` : '—'}</td>
                          {isSameState ? (
                            <>
                              <td className="px-3 py-3 text-right">{p ? inr(p.cgst) : '—'}</td>
                              <td className="px-3 py-3 text-right">{p ? inr(p.sgst) : '—'}</td>
                            </>
                          ) : (
                            <td className="px-3 py-3 text-right">{p ? inr(p.igst) : '—'}</td>
                          )}
                          <td className="px-3 py-3 text-right font-medium">{p ? inr(p.lineTotal) : '—'}</td>
                          <td className="px-2">
                            <button type="button" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))} aria-label="Remove line" className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className={`md:hidden flex flex-col gap-3 p-3 ${STAGGER_CHILDREN}`}>
                {lines.map((l, idx) => {
                  const p = lineAt(idx);
                  const mInput = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg';
                  return (
                    <div key={l.key} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          {so ? <div className="font-medium text-sm text-slate-900 break-words">{l.item ? variantText(l.item) : '…'}</div>
                            : <VariantPicker items={items} value={l.designVariantId} onChange={it => updateLine(l.key, { item: it, designVariantId: it?.designVariantId ?? '', rate: it?.defaultSellingRate ?? 0 })} onReload={reloadItems} />}
                          <div className="text-xs text-slate-500 mt-1">HSN {p?.hsn ?? l.item?.hsn ?? '—'} · Available {l.item?.onHand ?? '—'}</div>
                        </div>
                        <button type="button" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))} aria-label="Remove line" className="w-10 h-10 flex items-center justify-center text-slate-400"><Trash2 size={16} /></button>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><div className="text-xs font-medium text-muted">Qty{l.maxQty !== undefined ? ` (max ${l.maxQty})` : ''}</div>
                          <input type="number" inputMode="numeric" min={0} value={l.qty || ''} onChange={e => updateLine(l.key, { qty: Number(e.target.value) })} className={mInput} /></div>
                        <div><div className="text-xs font-medium text-muted">Rate</div>
                          {so ? <div className="py-2">{inr(l.rate)}</div> : <input type="number" inputMode="decimal" min={0} value={l.rate || ''} onChange={e => updateLine(l.key, { rate: Number(e.target.value) })} className={mInput} />}</div>
                        <div><div className="text-xs font-medium text-muted">Disc %</div>
                          {so ? <div className="py-2">{l.discountPct}%</div> : <input type="number" inputMode="decimal" min={0} max={100} value={l.discountPct || ''} onChange={e => updateLine(l.key, { discountPct: Number(e.target.value) })} className={mInput} />}</div>
                        <div><div className="text-xs font-medium text-muted">Taxable</div><div className="py-2">{p ? inr(p.taxableValue) : '—'}</div></div>
                        <div><div className="text-xs font-medium text-muted">GST %</div><div>{p ? `${p.taxRatePct}%` : '—'}</div></div>
                        {isSameState ? (
                          <>
                            <div><div className="text-xs font-medium text-muted">CGST</div><div>{p ? inr(p.cgst) : '—'}</div></div>
                            <div><div className="text-xs font-medium text-muted">SGST</div><div>{p ? inr(p.sgst) : '—'}</div></div>
                          </>
                        ) : (
                          <div><div className="text-xs font-medium text-muted">IGST</div><div>{p ? inr(p.igst) : '—'}</div></div>
                        )}
                        <div><div className="text-xs font-medium text-muted">Line Total</div><div className="font-semibold">{p ? inr(p.lineTotal) : '—'}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {priceError && <ErrorBanner message={priceError} />}

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex justify-end">
            <div className="w-full sm:w-72 flex flex-col gap-2 text-sm">
              <div className="flex justify-between text-slate-600"><span>Taxable Amount</span><span>{inr(preview?.taxableTotal)}</span></div>
              {isSameState ? (
                <>
                  <div className="flex justify-between text-slate-600"><span>CGST</span><span>{inr(preview?.cgstTotal)}</span></div>
                  <div className="flex justify-between text-slate-600"><span>SGST</span><span>{inr(preview?.sgstTotal)}</span></div>
                </>
              ) : (
                <div className="flex justify-between text-slate-600"><span>IGST</span><span>{inr(preview?.igstTotal)}</span></div>
              )}
              <div className="flex justify-between items-center text-slate-600">
                <span>Expenses (if any)</span>
                <input type="number" inputMode="decimal" min="0" step="0.01" value={expenses} onChange={e => setExpenses(e.target.value)} placeholder="0"
                  className="w-28 sm:w-24 text-right border border-slate-200 rounded px-2 py-2 sm:py-0.5 text-sm" />
              </div>
              <div className="flex justify-between text-slate-600"><span>Round Off</span><span>{inr(preview?.roundOff)}</span></div>
              <div className="flex justify-between gap-2 font-bold text-base border-t border-slate-200 pt-2 mt-1">
                <span>Grand Total</span>
                <span className="text-[#B80037] text-right">{inr(preview?.grandTotal)}</span>
              </div>
              <p className="text-[11px] text-slate-400">Tax rates come from the configured GST rules; the total is rounded to the nearest rupee.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Terms, bank details, additional notes…"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043] resize-none" />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Can perm="invoices.confirm" fallback={
            <button type="button" onClick={() => save(false)} disabled={isSaving || invalid}
              className="w-full sm:w-auto min-h-[40px] px-6 py-2 bg-[#E40043] text-white rounded-lg text-sm font-medium disabled:opacity-60">Save Draft for Approval</button>
          }>
            <button type="submit" disabled={isSaving || invalid || !preview}
              className="w-full sm:w-auto min-h-[40px] px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
              {isSaving ? 'Generating…' : 'Confirm Invoice'}
            </button>
          </Can>
          <button type="button" onClick={() => navigate('/sales/invoices')} className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
        </div>
      </form>

      <ConfirmDialog
        open={showConfirm}
        title="Confirm Invoice"
        impact={
          <div className="flex flex-col gap-1 text-sm">
            <div className="font-semibold">Stock deduction</div>
            <div>{designSummary}</div>
            <div className="font-semibold mt-2">Invoice total</div>
            <div>{inr(preview?.grandTotal)}</div>
            <div className="font-semibold mt-2">Tax</div>
            {isSameState ? <div>CGST {inr(preview?.cgstTotal)} · SGST {inr(preview?.sgstTotal)}</div> : <div>IGST {inr(preview?.igstTotal)}</div>}
          </div>
        }
        confirmLabel="Confirm Invoice"
        isLoading={isSaving}
        onConfirm={() => save(true)}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
