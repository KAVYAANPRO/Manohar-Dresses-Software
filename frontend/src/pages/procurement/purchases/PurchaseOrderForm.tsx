import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft, Plus, Trash2, PackageCheck } from 'lucide-react';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { Can, RestrictedValue } from '../../../lib/permissions/Can';
import { formatINR } from '../../../lib/format/money';
import { QuickAddMaterialSheet } from '../../../components/forms/QuickAddMaterialSheet';
import { QuickAddSupplierSheet } from '../../../components/forms/QuickAddSupplierSheet';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { UnitPickerField } from '../../../components/forms/UnitPickerField';
import { ColourPickerField } from '../../../components/forms/ColourPickerField';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { suppliersApi, type SupplierRecord } from '../../../lib/api/suppliers';
import {
  purchasesApi, materialsApi, materialVariantsApi, uomsApi, coloursApi, problemMessage, formatDate,
  PURCHASE_STATUS_LABEL, PURCHASE_STATUS_CLASS,
  type Purchase, type MaterialRecord, type MaterialVariantRecord, type UomRecord, type ColourRecord,
} from '../../../lib/api/procurement';

interface POItem {
  key: string;
  materialId: string;
  colourName: string;
  uomId: string;
  quantity: number;
  rate: number;
}

const newItem = (): POItem => ({ key: Math.random().toString(36).slice(2), materialId: '', colourName: '', uomId: '', quantity: 0, rate: 0 });

/** PUR-04 preview: other charges apportioned by line value (the server does the authoritative split on confirm). */
function apportion(amounts: number[], charges: number): number[] {
  const total = amounts.reduce((s, a) => s + a, 0);
  if (!charges || total <= 0) return amounts.map(() => 0);
  return amounts.map(a => (a / total) * charges);
}

export function PurchaseOrderForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [variants, setVariants] = useState<MaterialVariantRecord[]>([]);
  const [uoms, setUoms] = useState<UomRecord[]>([]);
  /** PO line waiting for a material created from the quick-add sheet. */
  const [addMaterialForItem, setAddMaterialForItem] = useState<string | null>(null);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  /** What was typed on the search page, used to pre-fill the quick-add sheet. */
  const [quickName, setQuickName] = useState('');
  const [picker, setPicker] = useState<{ kind: 'supplier' } | { kind: 'material'; key: string } | null>(null);
  const [queuedMsg, setQueuedMsg] = useState('');
  const [colours, setColours] = useState<ColourRecord[]>([]);
  const [purchase, setPurchase] = useState<Purchase | null>(null);

  const [formData, setFormData] = useState({ supplierId: '', supplierInvoiceNo: '', expectedDelivery: '', otherCharges: 0, notes: '' });
  const [items, setItems] = useState<POItem[]>([newItem()]);

  // An unsaved new purchase order is kept on this device until it is saved.
  const draft = useDraft(
    'purchase-order:new',
    { formData, items },
    d => { setFormData(d.formData); setItems(d.items?.length ? d.items : [newItem()]); },
    { enabled: !isLoading && !id, isEmpty: d => !d.formData.supplierId && !d.formData.notes && !d.formData.supplierInvoiceNo && d.items.every(i => !i.materialId && !i.quantity) },
  );

  const status = purchase?.status ?? 'DRAFT';
  // PUR-06 — a confirmed purchase is locked apart from notes/attachment.
  const isLocked = status !== 'DRAFT';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, m, v, u, c] = await Promise.all([
          suppliersApi.list(), materialsApi.list(), materialVariantsApi.list(), uomsApi.list(), coloursApi.list(),
        ]);
        if (!active) return;
        setSuppliers(s); setMaterials(m); setVariants(v); setUoms(u); setColours(c);
        if (id) {
          const p = await purchasesApi.get(id);
          if (!active) return;
          setPurchase(p);
          setFormData({
            supplierId: p.supplierId,
            supplierInvoiceNo: p.supplierInvoiceNo ?? '',
            expectedDelivery: p.expectedDeliveryDate ? p.expectedDeliveryDate.slice(0, 10) : '',
            otherCharges: p.otherCharges ?? 0,
            notes: p.notes ?? '',
          });
          const vMap = new Map(v.map(x => [x._id, x]));
          setItems(p.lines.map(l => {
            const variant = vMap.get(l.materialVariantId);
            return {
              key: l._id,
              materialId: variant?.materialId?._id ?? '',
              colourName: variant?.colourId?.name ?? '',
              uomId: l.uomId,
              quantity: l.qty,
              rate: l.rate,
            };
          }));
        }
      } catch (err) {
        if (active) setError(problemMessage(err, 'Could not load the purchase order.'));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const materialById = useMemo(() => new Map(materials.map(m => [m._id, m])), [materials]);
  const uomById = useMemo(() => new Map(uoms.map(u => [u._id, u])), [uoms]);
  const variantById = useMemo(() => new Map(variants.map(v => [v._id, v])), [variants]);

  /** Colours already set up for a material first, then the rest of the colour master. */
  const colourOptionsFor = (materialId: string) => {
    const own = variants.filter(v => v.materialId?._id === materialId).map(v => v.colourId?.name).filter(Boolean) as string[];
    const rest = colours.map(c => c.name).filter(n => !own.includes(n));
    return [...own, ...rest];
  };

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleItemChange = (key: string, field: keyof POItem, value: string | number) => {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const next = { ...item, [field]: value };
      if (field === 'materialId') next.uomId = materialById.get(String(value))?.baseUomId ?? '';
      return next;
    }));
  };

  const addItem = () => setItems(prev => [...prev, newItem()]);
  const removeItem = (key: string) => { if (items.length > 1) setItems(prev => prev.filter(i => i.key !== key)); };

  const lineAmounts = items.map(item => (item.quantity || 0) * (item.rate || 0));
  const calculateTotal = () => lineAmounts.reduce((t, a) => t + a, 0);
  const apportionedCharges = apportion(lineAmounts, Number(formData.otherCharges) || 0);
  const landedPreview = (idx: number) => {
    if (purchase && isLocked) {
      const l = purchase.lines[idx];
      return l?.landedUnitCost !== undefined ? l.landedUnitCost : undefined;
    }
    const it = items[idx];
    return it.quantity > 0 ? (lineAmounts[idx] + (apportionedCharges[idx] ?? 0)) / it.quantity : undefined;
  };

  const validate = (): string | null => {
    if (!formData.supplierId) return 'Please select a supplier.';
    for (const [i, it] of items.entries()) {
      if (!it.materialId) return `Item ${i + 1}: select a material.`;
      if (!it.colourName.trim()) return `Item ${i + 1}: enter a colour.`;
      if (!(it.quantity > 0)) return `Item ${i + 1}: quantity must be more than zero.`;
      if (it.rate < 0) return `Item ${i + 1}: rate cannot be negative.`;
    }
    return null;
  };

  const payload = () => ({
    supplierId: formData.supplierId,
    supplierInvoiceNo: formData.supplierInvoiceNo.trim() || undefined,
    expectedDeliveryDate: formData.expectedDelivery || undefined,
    otherCharges: Number(formData.otherCharges) || 0,
    notes: formData.notes,
    lines: items.map(it => ({ materialId: it.materialId, colourName: it.colourName.trim(), uomId: it.uomId || undefined, qty: it.quantity, rate: it.rate })),
  });

  const offlineLabel = () => {
    const sup = suppliers.find(s => s._id === formData.supplierId)?.name ?? 'supplier';
    return `Purchase order · ${sup} · ${items.length} item${items.length === 1 ? '' : 's'}`;
  };

  /** Saved on this device (no internet) - it is sent automatically once back online. */
  const finishQueued = (extra = '') => {
    draft.clear();
    setQueuedMsg(`Saved on this device — it will be sent when you're back online.${extra}`);
    window.setTimeout(() => navigate('/procurement/purchases'), 1800);
  };

  const saveDraft = async (): Promise<Purchase | 'queued' | null> => {
    const err = validate();
    if (err) { setError(err); return null; }
    setError('');
    if (purchase) return purchasesApi.update(purchase._id, payload());
    const res = await submitOrQueue<Purchase>({ method: 'POST', url: '/purchases', body: payload(), label: offlineLabel() });
    return res.queued ? 'queued' : res.data;
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    try {
      const saved = await saveDraft();
      if (saved === 'queued') { finishQueued(); return; }
      if (saved) { draft.clear(); navigate('/procurement/purchases'); }
    } catch (err) {
      setError(problemMessage(err));
    } finally { setIsSaving(false); }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    setShowConfirm(false);
    setIsSaving(true);
    try {
      const saved = await saveDraft();
      if (!saved) return;
      if (saved === 'queued') { finishQueued(' It is kept as a draft purchase order — confirm it once it has been sent.'); return; }
      draft.clear();
      await purchasesApi.confirm(saved._id);
      navigate('/procurement/purchases');
    } catch (err) {
      setError(problemMessage(err));
    } finally { setIsSaving(false); }
  };

  const saveNotes = async () => {
    if (!purchase) return;
    setIsSaving(true);
    try {
      const p = await purchasesApi.update(purchase._id, { notes: formData.notes });
      setPurchase(p);
      setError('');
    } catch (err) { setError(problemMessage(err)); } finally { setIsSaving(false); }
  };

  const confirmCancel = async () => {
    if (!purchase) { navigate('/procurement/purchases'); return; }
    setIsSaving(true);
    try {
      await purchasesApi.cancel(purchase._id, cancelReason.trim());
      setShowCancel(false);
      navigate('/procurement/purchases');
    } catch (err) {
      setShowCancel(false);
      setError(problemMessage(err));
    } finally { setIsSaving(false); }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const canReceive = purchase && (status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED');
  const uomCode = (uomId: string) => uomById.get(uomId)?.code ?? '';

  const materialSelect = (item: POItem) => (
    <PickerField
      value={materialById.get(item.materialId)?.name}
      placeholder="Tap to choose material"
      disabled={isLocked}
      onOpen={() => setPicker({ kind: 'material', key: item.key })}
    />
  );
  const colourInput = (item: POItem) => (
    <ColourPickerField
      options={colourOptionsFor(item.materialId)}
      value={item.colourName}
      onChange={c => handleItemChange(item.key, 'colourName', c)}
      placeholder="Choose colour"
      disabled={isLocked}
    />
  );
  const unitSelect = (item: POItem) => (
    <UnitPickerField uoms={uoms} value={item.uomId} onChange={u => handleItemChange(item.key, 'uomId', u)} emptyLabel="Base unit" disabled={isLocked} />
  );
  const pickedMaterialId = picker?.kind === 'material' ? items.find(i => i.key === picker.key)?.materialId : undefined;
  const supplierItems: PickerItem[] = suppliers
    .filter(s => s.isActive || s._id === formData.supplierId)
    .map(s => ({ id: s._id, title: s.name, subtitle: [s.contactPerson, s.mobile, s.gstin].filter(Boolean).join(' · '), keywords: `${s.mobile ?? ''} ${s.gstin ?? ''}` }));
  const materialItems: PickerItem[] = materials
    .filter(m => m.isActive || m._id === pickedMaterialId)
    .map(m => ({ id: m._id, title: m.name, subtitle: [m.fabricType, uomById.get(m.baseUomId)?.code].filter(Boolean).join(' · ') }));
  const receivedText = (idx: number) => {
    const l = purchase?.lines[idx];
    if (!l || !isLocked) return null;
    const v = variantById.get(l.materialVariantId);
    const base = v?.materialId?.baseUomId?.code ?? '';
    return `Received ${l.qtyReceivedBase.toLocaleString('en-IN')} / ${l.qtyBase.toLocaleString('en-IN')} ${base}`;
  };

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/procurement/purchases')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold flex flex-wrap items-center gap-2">
            {purchase ? purchase.docNo : 'Create Purchase Order'}
            {purchase && <span className={`px-2 py-1 rounded-full text-xs font-medium ${PURCHASE_STATUS_CLASS[status]}`}>{PURCHASE_STATUS_LABEL[status]}</span>}
          </h1>
          <p className="text-muted">{purchase ? `Dated ${formatDate(purchase.docDate)}${purchase.isDirect ? ' · raised automatically by a direct inward' : ''}` : 'Procure raw materials from suppliers.'}</p>
        </div>
      </div>

      {!purchase && <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setFormData({ supplierId: '', supplierInvoiceNo: '', expectedDelivery: '', otherCharges: 0, notes: '' }); setItems([newItem()]); }} />}
      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {isLocked && status !== 'CANCELLED' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          This purchase order is <strong>{PURCHASE_STATUS_LABEL[status]}</strong> and locked (PUR-06). Only notes stay editable — cancel it (with a reason) instead of editing supplier, items, or rates. Cancelling is blocked while any inward exists against it.
        </div>
      )}
      {status === 'CANCELLED' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Cancelled{purchase?.cancelReason ? ` — ${purchase.cancelReason}` : ''}.
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2 mb-2">Order Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PickerField
              label="Supplier"
              value={suppliers.find(s => s._id === formData.supplierId)?.name}
              hint={suppliers.find(s => s._id === formData.supplierId)?.mobile}
              placeholder="Tap to choose supplier"
              disabled={isLocked}
              onOpen={() => setPicker({ kind: 'supplier' })}
            />

            <Input
              label="Supplier Invoice Number"
              name="supplierInvoiceNo"
              value={formData.supplierInvoiceNo}
              onChange={handleHeaderChange}
              disabled={isLocked}
              placeholder="e.g. INV-8841 (must be unique per supplier)"
            />

            <Input
              label="Expected Delivery Date"
              name="expectedDelivery"
              type="date"
              value={formData.expectedDelivery}
              onChange={handleHeaderChange}
              disabled={isLocked}
            />

            <RestrictedValue perm="purchases.rate.view">
              <Input
                label="Expenses (if any) — freight, etc."
                name="otherCharges"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={formData.otherCharges || ''}
                onChange={e => setFormData(prev => ({ ...prev, otherCharges: parseFloat(e.target.value) || 0 }))}
                disabled={isLocked}
              />
            </RestrictedValue>
          </div>

          <div className="input-group">
            <label className="input-label">Notes / Instructions</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleHeaderChange}
              className="input-field min-h-[80px] resize-y"
              placeholder="Any special instructions for the supplier..."
              disabled={status === 'CANCELLED'}
            />
            {isLocked && status !== 'CANCELLED' && (
              <div className="mt-2">
                <Button type="button" variant="secondary" size="sm" onClick={saveNotes} isLoading={isSaving}>Save Notes</Button>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-[var(--color-border)] pb-2 mb-2">
            <h3 className="font-semibold text-lg">Materials</h3>
            {!isLocked && (
              <Button type="button" variant="outline" onClick={addItem}>
                <Plus size={16} /> Add Item
              </Button>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <th className="p-2 text-sm font-semibold text-muted w-[24%]">Material</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[16%]">Colour</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[12%]">Quantity</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[9%]">Unit</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[12%]">Rate (₹)</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[11%]">Total (₹)</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[12%]">Landed Unit Cost</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[4%]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item.key} className="border-b border-[var(--color-border)] last:border-0 align-top">
                    <td className="p-2">{materialSelect(item)}{receivedText(idx) && <div className="text-xs text-muted mt-1">{receivedText(idx)}</div>}</td>
                    <td className="p-2">{colourInput(item)}</td>
                    <td className="p-2">
                      <input type="number" inputMode="decimal" min="0.001" step="0.001" className="input-field w-full" value={item.quantity || ''}
                        onChange={(e) => handleItemChange(item.key, 'quantity', parseFloat(e.target.value) || 0)} disabled={isLocked} required />
                    </td>
                    <td className="p-2">{unitSelect(item)}</td>
                    <td className="p-2">
                      <RestrictedValue perm="purchases.rate.view">
                        <input type="number" inputMode="decimal" min="0" step="0.01" className="input-field w-full" value={item.rate || ''}
                          onChange={(e) => handleItemChange(item.key, 'rate', parseFloat(e.target.value) || 0)} disabled={isLocked} required />
                      </RestrictedValue>
                    </td>
                    <td className="p-2 font-medium">
                      <RestrictedValue perm="purchases.rate.view">{lineAmounts[idx].toLocaleString('en-IN')}</RestrictedValue>
                    </td>
                    <td className="p-2 text-sm text-slate-600">
                      <RestrictedValue perm="purchases.rate.view">
                        {landedPreview(idx) !== undefined ? landedPreview(idx)!.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}
                      </RestrictedValue>
                    </td>
                    <td className="p-2">
                      {!isLocked && (
                        <button type="button" onClick={() => removeItem(item.key)} disabled={items.length === 1}
                          className="icon-btn text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent" aria-label={`Remove item ${idx + 1}`}>
                          <Trash2 size={18} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted mt-2">Landed unit cost = (line amount + apportioned other charges) ÷ quantity (PUR-04) — the cost the resulting lot carries once inward is confirmed. Final figures are computed by the server on confirm.</p>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden flex flex-col gap-3">
            {items.map((item, index) => (
              <div key={item.key} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">Item {index + 1}</span>
                  {!isLocked && (
                    <button type="button" onClick={() => removeItem(item.key)} disabled={items.length === 1}
                      className="icon-btn text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent" aria-label={`Remove item ${index + 1}`}>
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
                <div className="input-group">
                  <label className="text-xs font-medium text-muted">Material</label>
                  {materialSelect(item)}
                </div>
                <div className="input-group">
                  <label className="text-xs font-medium text-muted">Colour</label>
                  {colourInput(item)}
                </div>
                {receivedText(index) && <div className="text-xs text-muted">{receivedText(index)}</div>}
                <div className="grid grid-cols-2 gap-3">
                  <div className="input-group">
                    <label className="text-xs font-medium text-muted">Quantity</label>
                    <input type="number" inputMode="decimal" min="0.001" step="0.001" className="input-field w-full" value={item.quantity || ''}
                      onChange={(e) => handleItemChange(item.key, 'quantity', parseFloat(e.target.value) || 0)} disabled={isLocked} required />
                  </div>
                  <div className="input-group">
                    <label className="text-xs font-medium text-muted">Unit</label>
                    {unitSelect(item)}
                  </div>
                  <div className="input-group">
                    <label className="text-xs font-medium text-muted">Rate (₹)</label>
                    <RestrictedValue perm="purchases.rate.view">
                      <input type="number" inputMode="decimal" min="0" step="0.01" className="input-field w-full" value={item.rate || ''}
                        onChange={(e) => handleItemChange(item.key, 'rate', parseFloat(e.target.value) || 0)} disabled={isLocked} required />
                    </RestrictedValue>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Total (₹)</span>
                    <span className="text-sm font-semibold">
                      <RestrictedValue perm="purchases.rate.view">{lineAmounts[index].toLocaleString('en-IN')}</RestrictedValue>
                    </span>
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted">Landed Unit Cost (₹{uomCode(item.uomId) ? ` / ${uomCode(item.uomId)}` : ''})</span>
                    <span className="text-sm text-slate-600">
                      <RestrictedValue perm="purchases.rate.view">
                        {landedPreview(index) !== undefined ? landedPreview(index)!.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}
                      </RestrictedValue>
                    </span>
                  </div>
                </div>
              </div>
            ))}
            {!isLocked && (
              <Button type="button" variant="secondary" onClick={addItem} className="w-full"><Plus size={16} /> Add Another Item</Button>
            )}
            <p className="text-xs text-muted">Landed unit cost = (line amount + apportioned other charges) ÷ quantity (PUR-04).</p>
          </div>

          <div className="flex justify-end pt-4 mt-2">
            <div className="bg-[var(--color-background)] p-4 rounded-lg border border-[var(--color-border)] w-full md:w-72 text-right">
              <span className="text-muted text-sm block">Total Order Amount</span>
              <RestrictedValue perm="purchases.rate.view">
                {formData.otherCharges > 0 ? (
                  <>
                    <span className="text-xl font-bold text-primary">
                      {formatINR(calculateTotal())} <span className="text-muted font-normal text-base">+</span> {formatINR(formData.otherCharges)}
                    </span>
                    <span className="text-xs text-muted block mt-1">
                      Materials {formatINR(calculateTotal())} + Expenses {formatINR(formData.otherCharges)} = <strong>{formatINR(calculateTotal() + Number(formData.otherCharges))}</strong>
                    </span>
                  </>
                ) : (
                  <span className="text-2xl font-bold text-primary">{formatINR(calculateTotal())}</span>
                )}
              </RestrictedValue>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-[var(--color-background)] p-4 border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6">
          {isLocked ? (
            <>
              {status !== 'CANCELLED' && status !== 'RECEIVED' && (
                <Can perm="purchases.cancel">
                  <Button className="w-full sm:w-auto" type="button" variant="danger" onClick={() => setShowCancel(true)}>
                    Cancel Purchase Order
                  </Button>
                </Can>
              )}
              {canReceive && (
                <Can perm="inward.create">
                  <Button className="w-full sm:w-auto" type="button" onClick={() => navigate(`/procurement/inward/${purchase!._id}`)}>
                    <PackageCheck size={16} /> Receive Material (Inward)
                  </Button>
                </Can>
              )}
            </>
          ) : (
            <>
              {purchase ? (
                <Can perm="purchases.cancel">
                  <Button className="w-full sm:w-auto" type="button" variant="danger" onClick={() => setShowCancel(true)}>Cancel Draft</Button>
                </Can>
              ) : (
                <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => { draft.clear(); navigate('/procurement/purchases'); }}>Discard</Button>
              )}
              <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={handleSaveDraft} isLoading={isSaving}>
                Save as Draft
              </Button>
              <Can perm="purchases.confirm">
                <Button className="w-full sm:w-auto" type="submit" isLoading={isSaving}>
                  Save & Confirm PO
                </Button>
              </Can>
            </>
          )}
        </div>
      </form>

      <PickerSheet
        open={picker?.kind === 'supplier'}
        title="Choose supplier"
        items={supplierItems}
        selectedId={formData.supplierId}
        searchPlaceholder="Search supplier, mobile or GSTIN…"
        onSelect={it => { setFormData(prev => ({ ...prev, supplierId: it.id })); setPicker(null); }}
        onClose={() => setPicker(null)}
        createLabel="supplier"
        onCreate={q => { setPicker(null); setQuickName(q); setAddSupplierOpen(true); }}
      />
      <PickerSheet
        open={picker?.kind === 'material'}
        title="Choose material"
        items={materialItems}
        selectedId={pickedMaterialId}
        searchPlaceholder="Search material…"
        onSelect={it => { if (picker?.kind === 'material') handleItemChange(picker.key, 'materialId', it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
        createLabel="material"
        onCreate={q => { const key = picker?.kind === 'material' ? picker.key : null; setPicker(null); setQuickName(q); if (key) setAddMaterialForItem(key); }}
      />

      <QuickAddSupplierSheet
        open={addSupplierOpen}
        initialName={quickName}
        onClose={() => setAddSupplierOpen(false)}
        onCreated={s => {
          setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
          setFormData(prev => ({ ...prev, supplierId: s._id }));
          setAddSupplierOpen(false);
        }}
      />

      <QuickAddMaterialSheet
        open={addMaterialForItem !== null}
        initialName={quickName}
        uoms={uoms}

        onClose={() => setAddMaterialForItem(null)}
        onCreated={material => {
          const key = addMaterialForItem;
          setMaterials(prev => [...prev, material].sort((a, b) => a.name.localeCompare(b.name)));
          setAddMaterialForItem(null);
          if (key) setItems(prev => prev.map(it => (it.key === key ? { ...it, materialId: material._id, uomId: material.baseUomId } : it)));
        }}
      />

      <ConfirmDialog
        open={showConfirm}
        title="Confirm Purchase Order"
        impact={
          <>
            Confirming creates a <strong>pending inward</strong> for {items.length} material{items.length > 1 ? 's' : ''} from {suppliers.find(s => s._id === formData.supplierId)?.name ?? 'the selected supplier'}.
            This does <strong>not</strong> add anything to stock yet — stock is only added once the material is physically received and the inward is confirmed (BR-01). After confirming, only notes can be edited.
          </>
        }
        confirmLabel="Confirm Purchase Order"
        isLoading={isSaving}
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirm(false)}
      />

      <ConfirmDialog
        open={showCancel}
        title="Cancel Purchase Order"
        impact={
          <div className="flex flex-col gap-2">
            <span>Cancel {purchase?.docNo}? It stays on record as Cancelled. Blocked while any inward exists against it (PUR-06).</span>
            <textarea
              className="input-field min-h-[70px]"
              placeholder="Reason for cancelling (required)"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
          </div>
        }
        confirmLabel="Cancel Purchase Order"
        cancelLabel="Keep"
        danger
        isLoading={isSaving}
        confirmDisabled={!cancelReason.trim()}
        onConfirm={confirmCancel}
        onCancel={() => setShowCancel(false)}
      />
    </div>
  );
}
