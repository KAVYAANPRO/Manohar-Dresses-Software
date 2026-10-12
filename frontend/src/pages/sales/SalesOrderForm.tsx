import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { useOnlineStatus } from '../../lib/offline/useOnlineStatus';
import { submitOrQueue } from '../../lib/offline/submitOrQueue';
import { useDraft } from '../../lib/drafts/useDraft';
import { DraftBanner } from '../../components/feedback/DraftBanner';
import { RestrictedValue } from '../../lib/permissions/Can';
import { agentsApi, companyApi, apiErrorMessage, inr, customerLabel, type AgentRecord, type CustomerRef, type SalesOrderView, type SellableItem } from '../../lib/api/sales';
import { AgentPickerField, CustomerPickerField, ErrorBanner, VariantPicker, notifySavedOffline, useCustomers, usePricePreview, useSellableItems } from './shared';
import { STAGGER_CHILDREN } from '../pageKit';

interface OrderLine {
  id: string;
  designVariantId: string;
  item: SellableItem | null;
  qty: number;
  rate: number;
  discountPct: number;
}

let lineId = 1;

export function SalesOrderForm() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { items, error: itemsError, reload: reloadItems } = useSellableItems();
  const { customers, error: custError, loaded: customersLoaded, add: addCustomer } = useCustomers();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [companyName, setCompanyName] = useState('');

  const [customerId, setCustomerId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [transportName, setTransportName] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [discountRatePct, setDiscountRatePct] = useState(0);
  const [extraDiscountPct, setExtraDiscountPct] = useState(0);
  const [shippingCharge, setShippingCharge] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    agentsApi.list().then(a => setAgents(a.filter(x => x.isActive))).catch(() => undefined);
    companyApi.get().then(c => setCompanyName(c.legalName)).catch(() => undefined);
  }, []);

  const customer = customers.find(c => c._id === customerId);

  // Draft: kept on this device until the order is saved or discarded (Back never loses it).
  const draftValue = useMemo(
    () => ({ customerId, agentId, orderNumber, transportName, expectedDate, notes, discountRatePct, extraDiscountPct, shippingCharge, expenses, lines }),
    [customerId, agentId, orderNumber, transportName, expectedDate, notes, discountRatePct, extraDiscountPct, shippingCharge, expenses, lines],
  );
  const draft = useDraft('sales-order:new', draftValue, d => {
    setCustomerId(d.customerId); setAgentId(d.agentId); setOrderNumber(d.orderNumber); setTransportName(d.transportName);
    setExpectedDate(d.expectedDate); setNotes(d.notes); setDiscountRatePct(d.discountRatePct); setExtraDiscountPct(d.extraDiscountPct);
    setShippingCharge(d.shippingCharge); setExpenses(d.expenses); setLines(d.lines);
    lineId = Math.max(lineId, ...d.lines.map(l => Number(l.id) + 1));
  }, {
    enabled: customersLoaded,
    isEmpty: v => !v.customerId && !v.orderNumber && !v.transportName && !v.notes && v.lines.every(l => !l.designVariantId && !l.qty),
  });
  // Refresh stock figures on restored lines once the live product list is in.
  useEffect(() => {
    if (!items.length) return;
    setLines(prev => prev.map(l => (l.designVariantId ? { ...l, item: items.find(i => i.designVariantId === l.designVariantId) ?? l.item } : l)));
  }, [items, draft.restoredAt]);

  const onCustomer = (c: CustomerRef | null) => {
    setCustomerId(c?._id ?? '');
    const d = c?.defaultDiscountPct ?? 0;
    setDiscountRatePct(d);
    setLines(prev => prev.map(l => ({ ...l, discountPct: d })));
    if (c?.agentId) setAgentId(String(c.agentId));
  };

  const onHeaderDiscount = (v: number) => {
    setDiscountRatePct(v);
    setLines(prev => prev.map(l => ({ ...l, discountPct: v })));
  };

  const addLine = () => setLines(prev => [...prev, { id: String(lineId++), designVariantId: '', item: null, qty: 0, rate: 0, discountPct: discountRatePct }]);
  const updateLine = (id: string, patch: Partial<OrderLine>) => setLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const pickItem = (id: string, item: SellableItem | null) =>
    updateLine(id, { item, designVariantId: item?.designVariantId ?? '', rate: item?.defaultSellingRate ?? 0 });
  const removeLine = (id: string) => setLines(prev => prev.filter(l => l.id !== id));

  const otherCharges = shippingCharge + expenses;
  const lineInputs = lines.map(l => ({ designVariantId: l.designVariantId, qty: l.qty, unitRate: l.rate || undefined, discountPct: l.discountPct, extraDiscountPct: extraDiscountPct || undefined }));
  const { preview, error: priceError, lineAt } = usePricePreview(customerId, lineInputs, otherCharges);

  // Several lines may draw on the same product: compare their total against its ATP.
  const qtyByVariant = new Map<string, number>();
  for (const l of lines) if (l.designVariantId) qtyByVariant.set(l.designVariantId, (qtyByVariant.get(l.designVariantId) ?? 0) + l.qty);
  const overAtp = (l: OrderLine) => !!l.item && (qtyByVariant.get(l.designVariantId) ?? 0) > l.item.atp;
  const hasAtpViolation = lines.some(overAtp);
  const incomplete = lines.length === 0 || lines.some(l => !l.designVariantId || l.qty <= 0);

  const buildBody = (confirm: boolean) => ({
    customerId,
    agentId: agentId || undefined,
    customerRefNo: orderNumber || undefined,
    transportName: transportName || undefined,
    expectedDate: expectedDate || undefined,
    notes: notes || undefined,
    shippingCharge: shippingCharge || undefined,
    otherCharges: expenses || undefined,
    lines: lines.map(l => ({
      designVariantId: l.designVariantId,
      qty: l.qty,
      unitRate: l.rate,
      discountPct: l.discountPct,
      extraDiscountPct: extraDiscountPct || undefined,
    })),
    confirm,
  });

  const handleSave = async (confirm: boolean) => {
    setSaving(true);
    setError('');
    try {
      // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
      const res = await submitOrQueue<SalesOrderView>({
        method: 'POST',
        url: '/sales-orders',
        body: buildBody(confirm),
        label: `Sales order · ${customerLabel(customer) || 'customer'} · ${lines.length} item${lines.length === 1 ? '' : 's'}`,
      });
      draft.clear();
      if (res.queued) {
        notifySavedOffline('this sales order');
        navigate('/sales/orders');
      } else {
        navigate(`/sales/orders/${res.data._id}`);
      }
    } catch (e) {
      const data = (e as { response?: { data?: { salesOrderId?: string } } }).response?.data;
      if (data?.salesOrderId) draft.clear();
      setError(
        apiErrorMessage(e, 'Could not save the sales order.') +
          (data?.salesOrderId ? ' The order was saved as a Draft — open it from the Sales Orders list to adjust and confirm later.' : ''),
      );
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]';
  const taxTotal = preview ? preview.cgstTotal + preview.sgstTotal + preview.igstTotal : 0;

  const totals = (
    <>
      <div className="flex justify-between"><span className="text-slate-500">Gross</span><span className="font-semibold text-slate-900"><RestrictedValue perm="salesorders.rate.view">{inr(preview?.subtotal)}</RestrictedValue></span></div>
      <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-semibold text-red-600"><RestrictedValue perm="salesorders.rate.view">−{inr(preview?.discountTotal)}</RestrictedValue></span></div>
      <div className="flex justify-between"><span className="text-slate-500">Taxable</span><span className="font-semibold text-slate-900"><RestrictedValue perm="salesorders.rate.view">{inr(preview?.taxableTotal)}</RestrictedValue></span></div>
      {preview && (preview.isIntraState ? (
        <>
          <div className="flex justify-between"><span className="text-slate-500">CGST</span><span className="font-semibold text-slate-900">{inr(preview.cgstTotal)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">SGST</span><span className="font-semibold text-slate-900">{inr(preview.sgstTotal)}</span></div>
        </>
      ) : (
        <div className="flex justify-between"><span className="text-slate-500">IGST</span><span className="font-semibold text-slate-900">{inr(preview.igstTotal)}</span></div>
      ))}
      {otherCharges > 0 && <div className="flex justify-between"><span className="text-slate-500">Shipping + Expenses</span><span className="font-semibold text-slate-900">{inr(otherCharges)}</span></div>}
      {preview && preview.roundOff !== 0 && <div className="flex justify-between"><span className="text-slate-500">Round Off</span><span className="text-slate-600">{inr(preview.roundOff)}</span></div>}
      <div className="flex justify-between items-baseline gap-2 pt-2 mt-1 border-t border-slate-200">
        <span className="font-bold text-slate-700">Grand Total (estimate)</span>
        <span className="text-lg font-bold text-slate-900 text-right"><RestrictedValue perm="salesorders.rate.view">{inr(preview?.grandTotal)}</RestrictedValue></span>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/sales/orders')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">New Sales Order</h1>
          <p className="text-sm text-slate-500">Confirming reserves ATP. Stock on-hand is deducted only when invoiced.</p>
        </div>
      </div>

      <ErrorBanner message={error || itemsError || custError} onClose={() => setError('')} />
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Billing Organization</label>
            <input type="text" value={companyName} disabled className="w-full px-3 py-2 text-sm border border-slate-100 bg-slate-50 rounded-lg text-slate-600" />
          </div>
          <div>
            <CustomerPickerField
              label={<span className="block text-xs font-medium text-slate-600">Customer *</span>}
              customers={customers}
              value={customerId}
              onChange={onCustomer}
              onAdded={addCustomer}
            />
            <p className="text-xs text-slate-400 mt-1">New customer? Add one from the search page.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Place of supply</label>
            <input type="text" value={customer ? `${customer.state ?? 'State not set!'}${customer.gstin ? ` · ${customer.gstin}` : ''}` : ''} disabled placeholder="Auto-filled from customer"
              className="w-full px-3 py-2 text-sm border border-slate-100 bg-slate-50 rounded-lg text-slate-600" />
          </div>

          <div>
            <AgentPickerField
              label={<span className="block text-xs font-medium text-slate-600">Agent</span>}
              agents={agents}
              value={agentId}
              onChange={a => setAgentId(a?._id ?? '')}
              onAdded={a => setAgents(prev => [...prev, a])}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Customer Order No.</label>
            <input type="text" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="Customer's PO / manual ref (optional)" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Transport Name</label>
            <input type="text" value={transportName} onChange={e => setTransportName(e.target.value)} placeholder="Transport / courier" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Date of Order</label>
            <input type="text" value={new Date().toLocaleDateString('en-GB').split('/').join('-')} disabled className="w-full px-3 py-2 text-sm border border-slate-100 bg-slate-50 rounded-lg text-slate-600" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expected Date</label>
            <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Discount Rate (%)</label>
            <input type="number" inputMode="decimal" min={0} max={100} value={discountRatePct || ''} onChange={e => onHeaderDiscount(Number(e.target.value) || 0)} placeholder="0" className={inputCls} />
            <p className="text-xs text-slate-400 mt-1">Defaults to the customer's discount; applied to every line.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Other Discount (%) — optional</label>
            <input type="number" inputMode="decimal" min={0} max={100} value={extraDiscountPct || ''} onChange={e => setExtraDiscountPct(Number(e.target.value) || 0)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Shipping Charge (₹)</label>
            <input type="number" inputMode="decimal" min={0} value={shippingCharge || ''} onChange={e => setShippingCharge(Number(e.target.value) || 0)} placeholder="0" className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Expenses (if any) — transport, etc.</label>
            <input type="number" inputMode="decimal" min={0} value={expenses || ''} onChange={e => setExpenses(Number(e.target.value) || 0)} placeholder="0" className={inputCls} />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Note</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Internal notes…" className={inputCls} />
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          You're offline — this order will be saved on this device and synced automatically once you're back online.
        </div>
      )}

      <div className="bg-[#FFF0F3] border border-[#FFB8CA] rounded-xl px-4 py-3 flex items-start gap-2">
        <Info size={15} className="text-[#E40043] mt-0.5 shrink-0" />
        <p className="text-sm text-[#8F002B]">ATP (Available-to-Promise) = On Hand − Reserved. GST is calculated from the configured tax rules (CGST+SGST within the state, IGST otherwise). Discounts apply before tax.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items (from stock)</span>
          <button onClick={addLine} className="flex items-center gap-1.5 min-h-[40px] px-2 -mr-2 text-sm text-[#E40043] font-medium hover:text-[#8F002B]"><Plus size={14} /> Add Line</button>
        </div>

        {lines.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">No lines yet. Click "Add Line" to begin.</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    {['Design / Colour / Size', 'ATP', 'Qty', 'Rate (₹)', 'Disc %', 'GST', 'Amount', ''].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs text-slate-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const warn = overAtp(l);
                    const priced = lineAt(idx);
                    return (
                      <tr key={l.id} className={`border-b border-slate-100 last:border-0 ${warn ? 'bg-amber-50' : ''}`}>
                        <td className="px-3 py-2"><VariantPicker compact items={items} value={l.designVariantId} onChange={it => pickItem(l.id, it)} onReload={reloadItems} /></td>
                        <td className="px-3 py-2 text-center">
                          {l.item ? (
                            <div className="flex flex-col items-center">
                              <span className={`text-xs font-bold ${l.item.atp > 0 ? 'text-green-700' : 'text-red-600'}`}>{l.item.atp}</span>
                              <span className="text-[10px] text-slate-400">of {l.item.onHand}</span>
                            </div>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" inputMode="numeric" min={0} value={l.qty || ''} onChange={e => updateLine(l.id, { qty: Number(e.target.value) })}
                            className={`w-16 px-2 py-1.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-[#F2346A] ${warn ? 'border-amber-400 bg-amber-50' : 'border-slate-200'}`} />
                          {warn && <div className="text-[10px] text-amber-600 flex items-center gap-0.5 mt-0.5"><AlertTriangle size={9} /> Exceeds ATP</div>}
                        </td>
                        <td className="px-3 py-2">
                          <RestrictedValue perm="salesorders.rate.view">
                            <input type="number" inputMode="decimal" min={0} value={l.rate || ''} onChange={e => updateLine(l.id, { rate: Number(e.target.value) })}
                              className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#F2346A]" />
                          </RestrictedValue>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" inputMode="decimal" min={0} max={100} value={l.discountPct || ''} onChange={e => updateLine(l.id, { discountPct: Number(e.target.value) })}
                            className="w-14 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-[#F2346A]" />
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{priced ? `${priced.taxRatePct}% · ${inr(priced.cgst + priced.sgst + priced.igst)}` : '—'}</td>
                        <td className="px-3 py-2 text-right font-medium text-slate-900 whitespace-nowrap"><RestrictedValue perm="salesorders.rate.view">{priced ? inr(priced.lineTotal) : '—'}</RestrictedValue></td>
                        <td className="px-3 py-2"><button onClick={() => removeLine(l.id)} aria-label="Remove line" className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex justify-end p-4 border-t border-slate-200 bg-slate-50">
                <div className="w-full max-w-xs flex flex-col gap-1.5 text-sm">{totals}</div>
              </div>
            </div>

            <div className={`md:hidden flex flex-col gap-3 p-3 ${STAGGER_CHILDREN}`}>
              {lines.map((l, idx) => {
                const warn = overAtp(l);
                const priced = lineAt(idx);
                const mInput = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]';
                return (
                  <div key={l.id} className={`flex flex-col gap-3 p-3 border rounded-lg ${warn ? 'border-amber-300 bg-amber-50' : 'border-[var(--color-border)] bg-[var(--color-background)]'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">Line {idx + 1}</span>
                      <button onClick={() => removeLine(l.id)} aria-label="Remove line" className="flex items-center justify-center w-10 h-10 -mr-2 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                    <VariantPicker items={items} value={l.designVariantId} onChange={it => pickItem(l.id, it)} onReload={reloadItems} />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">ATP</label>
                        {l.item ? <div className="py-2 text-sm"><span className={`font-bold ${l.item.atp > 0 ? 'text-green-700' : 'text-red-600'}`}>{l.item.atp}</span><span className="text-xs text-slate-400"> of {l.item.onHand}</span></div> : <div className="py-2 text-sm text-slate-300">—</div>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">Qty</label>
                        <input type="number" inputMode="numeric" min={0} value={l.qty || ''} onChange={e => updateLine(l.id, { qty: Number(e.target.value) })} className={`${mInput} ${warn ? 'border-amber-400 bg-amber-50' : ''}`} />
                        {warn && <div className="text-xs text-amber-600 flex items-center gap-0.5 mt-0.5"><AlertTriangle size={10} /> Exceeds ATP</div>}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">Rate (₹)</label>
                        <RestrictedValue perm="salesorders.rate.view">
                          <input type="number" inputMode="decimal" min={0} value={l.rate || ''} onChange={e => updateLine(l.id, { rate: Number(e.target.value) })} className={mInput} />
                        </RestrictedValue>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">Disc %</label>
                        <input type="number" inputMode="decimal" min={0} max={100} value={l.discountPct || ''} onChange={e => updateLine(l.id, { discountPct: Number(e.target.value) })} className={mInput} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">GST</label>
                        <div className="py-2 text-sm text-slate-700">{priced ? `${priced.taxRatePct}% · ${inr(priced.cgst + priced.sgst + priced.igst)}` : '—'}</div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted mb-1">Amount</label>
                        <div className="py-2 text-sm font-semibold text-slate-900"><RestrictedValue perm="salesorders.rate.view">{priced ? inr(priced.lineTotal) : '—'}</RestrictedValue></div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm">{totals}</div>
            </div>
          </>
        )}
      </div>

      {priceError && <ErrorBanner message={priceError} />}
      {hasAtpViolation && (
        <div className="rounded-xl border px-4 py-3 flex items-start gap-2 bg-amber-50 border-amber-200">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
          <p className="text-sm text-amber-800">Some quantities exceed current ATP. You can save as Draft, but confirming will be refused until stock is available.</p>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <button onClick={() => navigate('/sales/orders')} className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancel</button>
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button onClick={() => handleSave(false)} disabled={!customerId || incomplete || saving}
            className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 font-medium">
            Save as Draft
          </button>
          <button onClick={() => setShowConfirm(true)} disabled={!customerId || incomplete || hasAtpViolation || saving}
            className="w-full sm:w-auto min-h-[40px] px-4 py-2 text-sm bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] disabled:opacity-50 font-medium flex items-center justify-center gap-2">
            <CheckCircle size={15} /> Confirm Order
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90dvh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Confirm Sales Order</h3>
            <div className="text-sm text-slate-600 mb-4 flex flex-col gap-2">
              <p>Confirming will <strong>reserve {lines.reduce((s, l) => s + l.qty, 0)} pieces</strong> across {lines.length} line(s) for <strong>{customerLabel(customer)}</strong>.</p>
              <ul className="text-xs text-slate-500">
                {lines.map(l => l.item && <li key={l.id}>{l.item.designNo} / {l.item.colourName} / {l.item.sizeName}: requested {l.qty}, available {l.item.atp}</li>)}
              </ul>
              <p>Estimated total: <strong><RestrictedValue perm="salesorders.rate.view">{inr(preview?.grandTotal)}</RestrictedValue></strong>{taxTotal > 0 && <> (GST {inr(taxTotal)})</>}</p>
              <p>Stock on-hand is <strong>not reduced</strong> until invoiced.</p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
              <button onClick={() => setShowConfirm(false)} className="min-h-[40px] px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => { setShowConfirm(false); handleSave(true); }} className="min-h-[40px] px-4 py-2 text-sm bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] font-medium">Yes, Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
