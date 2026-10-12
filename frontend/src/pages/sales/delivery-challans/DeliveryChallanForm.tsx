import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Truck, FileText, RotateCcw } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { challansApi, salesOrdersApi, challanStatusLabel, apiErrorMessage, fmtDate, customerLabel, type ChallanRow, type SalesOrderRow, type SellableItem } from '../../../lib/api/sales';
import { CustomerPickerField, ErrorBanner, Spinner, VariantPicker, notifySavedOffline, useCustomers, useSellableItems } from '../shared';
import { PickerField, PickerSheet, type PickerItem } from '../../../components/forms/PickerSheet';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

interface Line { id: string; designVariantId: string; item: SellableItem | null; qty: number; rate: number }
let lineId = 1;

const PURPOSES: { value: string; label: string }[] = [
  { value: 'APPROVAL', label: 'On approval' },
  { value: 'CONSIGNMENT', label: 'Consignment' },
  { value: 'DELIVERY', label: 'Delivery (invoice to follow)' },
  { value: 'OTHER', label: 'Other' },
];

function ChallanView({ id }: { id: string }) {
  const navigate = useNavigate();
  const [c, setC] = useState<ChallanRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ret, setRet] = useState<Record<string, { qty: string; condition: 'GOOD' | 'DAMAGED' }>>({});

  const load = () => challansApi.get(id).then(setC).catch(e => setError(apiErrorMessage(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await fn(); await load(); } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (!c) return error ? <div className="p-6"><ErrorBanner message={error} /></div> : <Spinner />;
  const open = c.status === 'DISPATCHED' || c.status === 'PARTIALLY_CLOSED';
  const returnLines = c.lines.filter(l => Number(ret[l._id]?.qty) > 0).map(l => ({ lineId: l._id, qty: Number(ret[l._id].qty), condition: ret[l._id].condition }));

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/sales/delivery-challans')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 break-all">{c.docNo}</h1>
          <p className="text-sm text-slate-500">{c.customerName} · {fmtDate(c.docDate)} · {PURPOSES.find(p => p.value === c.purpose)?.label}{c.salesOrderNo ? ` · SO ${c.salesOrderNo}` : ''}</p>
        </div>
        <span className="px-2 py-1 rounded-full text-xs font-medium transition-colors bg-[#FFDCE5] text-[#B80037]">{challanStatusLabel[c.status]}</span>
      </div>
      <ErrorBanner message={error} onClose={() => setError('')} />
      {(c.transportName || c.vehicleNumber || c.notes) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700">
          {c.transportName && <div>Transport: {c.transportName}{c.vehicleNumber ? ` · ${c.vehicleNumber}` : ''}</div>}
          {c.notes && <div>Notes: {c.notes}</div>}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {c.lines.map(l => (
          <div key={l._id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-slate-900">{l.designNo} / {l.colourName} / {l.sizeName}</div>
              <div className="text-xs text-slate-500">Sent {l.qty} · Invoiced {l.qtyInvoiced} · Returned {l.qtyReturned} · <strong>With customer {l.openQty}</strong></div>
            </div>
            {open && l.openQty > 0 && (
              <div className="grid grid-cols-[6rem_1fr] items-center gap-2 md:w-80">
                <input type="number" inputMode="numeric" min={0} max={l.openQty} placeholder="Return qty" aria-label="Return quantity"
                  value={ret[l._id]?.qty ?? ''} onChange={e => setRet(p => ({ ...p, [l._id]: { condition: p[l._id]?.condition ?? 'GOOD', qty: e.target.value } }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
                <ChoiceChips
                  ariaLabel="Condition"
                  value={ret[l._id]?.condition ?? 'GOOD'}
                  options={[{ value: 'GOOD', label: 'Good → Ready' }, { value: 'DAMAGED', label: 'Damaged' }]}
                  onChange={v => setRet(p => ({ ...p, [l._id]: { qty: p[l._id]?.qty ?? '', condition: v } }))}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {c.invoices && c.invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm flex flex-col gap-1">
          <div className="text-xs font-semibold text-slate-500 uppercase">Invoices</div>
          {c.invoices.map(i => <Link key={i._id} className="text-[#E40043]" to={`/sales/invoices/${i._id}`}>{i.status === 'DRAFT' ? 'Draft invoice' : i.docNo} ({i.status.toLowerCase()})</Link>)}
        </div>
      )}

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        {c.status === 'DRAFT' && (
          <Can perm="salesorders.confirm">
            <button disabled={busy} onClick={() => run(() => challansApi.dispatch(c._id))} className="w-full sm:w-auto min-h-[40px] px-5 py-2 bg-[#E40043] text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"><Truck size={15} /> Dispatch (move stock out)</button>
          </Can>
        )}
        {open && (
          <>
            <button disabled={busy || returnLines.length === 0} onClick={() => run(async () => { await challansApi.returnGoods(c._id, returnLines); setRet({}); })}
              className="w-full sm:w-auto min-h-[40px] px-5 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"><RotateCcw size={15} /> Record Return</button>
            <Can perm="invoices.confirm">
              <button disabled={busy} onClick={() => run(async () => { const inv = await challansApi.invoice(c._id, { confirm: true }); navigate(`/sales/invoices/${inv._id}`); })}
                className="w-full sm:w-auto min-h-[40px] px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"><FileText size={15} /> Invoice what's still with customer</button>
            </Can>
          </>
        )}
        {(c.status === 'DRAFT' || (c.status === 'DISPATCHED' && c.lines.every(l => l.qtyInvoiced === 0 && l.qtyReturned === 0))) && (
          <Can perm="salesorders.cancel">
            <button disabled={busy} onClick={() => run(() => challansApi.cancel(c._id, 'Cancelled by user'))} className="w-full sm:w-auto min-h-[40px] px-5 py-2 border border-red-200 text-red-600 rounded-lg text-sm">Cancel Challan</button>
          </Can>
        )}
      </div>
    </div>
  );
}

export function DeliveryChallanForm() {
  const { id } = useParams<{ id: string }>();
  if (id) return <ChallanView id={id} />;
  return <NewChallan />;
}

function NewChallan() {
  const navigate = useNavigate();
  const { items, reload: reloadItems } = useSellableItems();
  const { customers, loaded: customersLoaded, add: addCustomer } = useCustomers();
  const [orders, setOrders] = useState<SalesOrderRow[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [purpose, setPurpose] = useState('APPROVAL');
  const [transportName, setTransportName] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const closeOrderPicker = useCallback(() => setOrderPickerOpen(false), []);

  useEffect(() => { salesOrdersApi.list().then(setOrders).catch(() => undefined); }, []);

  // Draft: kept on this device until the challan is saved or discarded.
  const draftValue = useMemo(
    () => ({ customerId, salesOrderId, purpose, transportName, vehicleNumber, notes, lines }),
    [customerId, salesOrderId, purpose, transportName, vehicleNumber, notes, lines],
  );
  const draft = useDraft('delivery-challan:new', draftValue, d => {
    setCustomerId(d.customerId); setSalesOrderId(d.salesOrderId); setPurpose(d.purpose); setTransportName(d.transportName);
    setVehicleNumber(d.vehicleNumber); setNotes(d.notes); setLines(d.lines);
    lineId = Math.max(lineId, ...d.lines.map(l => Number(l.id) + 1));
  }, {
    enabled: customersLoaded,
    isEmpty: v => !v.customerId && !v.transportName && !v.vehicleNumber && !v.notes && v.lines.every(l => !l.designVariantId && !l.qty),
  });
  // Refresh stock figures on restored lines once the live product list is in.
  useEffect(() => {
    if (!items.length) return;
    setLines(p => p.map(l => (l.designVariantId ? { ...l, item: items.find(i => i.designVariantId === l.designVariantId) ?? l.item } : l)));
  }, [items, draft.restoredAt]);

  const addLine = () => setLines(p => [...p, { id: String(lineId++), designVariantId: '', item: null, qty: 0, rate: 0 }]);
  const updateLine = (id: string, patch: Partial<Line>) => setLines(p => p.map(l => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines(p => p.filter(l => l.id !== id));
  const invalid = !customerId || lines.length === 0 || lines.some(l => !l.designVariantId || l.qty <= 0);
  const customer = customers.find(c => c._id === customerId);
  const selectedOrder = orders.find(o => o._id === salesOrderId);
  const orderItems = useMemo<PickerItem[]>(() => [
    { id: '', title: 'None', subtitle: 'Not against a sales order' },
    ...orders
      .filter(o => o.customerId === customerId && o.status !== 'CANCELLED')
      .map(o => ({ id: o._id, title: o.docNo, subtitle: [fmtDate(o.docDate), o.status.replace(/_/g, ' ').toLowerCase()].join(' · ') })),
  ], [orders, customerId]);

  const handleSave = async (dispatch: boolean) => {
    setSaving(true); setError('');
    try {
      // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
      const res = await submitOrQueue<ChallanRow>({
        method: 'POST',
        url: '/delivery-challans',
        body: {
          customerId, salesOrderId: salesOrderId || undefined, purpose,
          transportName: transportName || undefined, vehicleNumber: vehicleNumber || undefined, notes: notes || undefined,
          lines: lines.map(l => ({ designVariantId: l.designVariantId, qty: l.qty, unitRate: l.rate || undefined })),
          dispatch,
        },
        label: `Delivery challan · ${customerLabel(customer) || 'customer'} · ${lines.reduce((s, l) => s + l.qty, 0)} pcs`,
      });
      draft.clear();
      if (res.queued) {
        notifySavedOffline('this delivery challan');
        navigate('/sales/delivery-challans');
      } else {
        navigate(`/sales/delivery-challans/${res.data._id}`);
      }
    } catch (e) {
      const data = (e as { response?: { data?: { deliveryChallanId?: string } } }).response?.data;
      if (data?.deliveryChallanId) draft.clear();
      setError(apiErrorMessage(e, 'Could not save the challan.') + (data?.deliveryChallanId ? ' The challan was saved as a Draft.' : ''));
    } finally { setSaving(false); }
  };

  const inputClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/sales/delivery-challans')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">New Delivery Challan</h1>
          <p className="text-sm text-slate-500">Goods sent to a customer before / without an invoice. Dispatch moves them out of ready stock; later bill them or record their return.</p>
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <CustomerPickerField
          label={<span className="block text-xs font-medium text-slate-600">Customer *</span>}
          customers={customers}
          value={customerId}
          onChange={c => { setCustomerId(c?._id ?? ''); setSalesOrderId(''); }}
          onAdded={addCustomer}
        />
        <div>
          <PickerField
            label={<span className="block text-xs font-medium text-slate-600">Sales Order (if any)</span>}
            value={selectedOrder?.docNo ?? 'None'}
            disabled={!customerId}
            onOpen={() => setOrderPickerOpen(true)}
          />
          <PickerSheet
            open={orderPickerOpen}
            title="Choose sales order"
            items={orderItems}
            selectedId={salesOrderId}
            onSelect={it => { setSalesOrderId(it.id); setOrderPickerOpen(false); }}
            onClose={closeOrderPicker}
            searchPlaceholder="Order no.…"
            emptyText="This customer has no open sales order."
            onCreate={() => { setOrderPickerOpen(false); navigate('/sales/orders/new'); }}
            createLabel="sales order"
          />
        </div>
        <ChoiceChips
          className="md:col-span-3"
          label={<span className="block text-xs font-medium text-slate-600">Purpose</span>}
          value={purpose}
          options={PURPOSES}
          onChange={setPurpose}
        />
        <div>
          <label className={labelClass}>Transport Name</label>
          <input className={inputClass} value={transportName} onChange={e => setTransportName(e.target.value)} placeholder="e.g. Shree Cargo" />
        </div>
        <div>
          <label className={labelClass}>Vehicle Number</label>
          <input className={inputClass} value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value)} placeholder="e.g. GJ-01-AB-1234" />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-2 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Items Dispatched</span>
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
                  <div><label className="block text-xs font-medium text-muted mb-1">Qty</label>
                    <input type="number" inputMode="numeric" min={0} className={`${inputClass} ${l.item && l.qty > l.item.atp ? 'border-amber-400 bg-amber-50' : ''}`} value={l.qty || ''} onChange={e => updateLine(l.id, { qty: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1">Rate (₹)</label>
                    <input type="number" inputMode="decimal" min={0} className={inputClass} value={l.rate || ''} onChange={e => updateLine(l.id, { rate: Number(e.target.value) })} /></div>
                  <div><label className="block text-xs font-medium text-muted mb-1">Available</label><div className="py-2 text-sm">{l.item ? l.item.atp : '—'}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Can perm="salesorders.confirm">
          <button onClick={() => handleSave(true)} disabled={invalid || saving} className="w-full sm:w-auto min-h-[40px] px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Save & Dispatch'}
          </button>
        </Can>
        <button onClick={() => handleSave(false)} disabled={invalid || saving} className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium disabled:opacity-60">Save as Draft</button>
        <button onClick={() => navigate('/sales/delivery-challans')} className="w-full sm:w-auto min-h-[40px] px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
      </div>
    </div>
  );
}
