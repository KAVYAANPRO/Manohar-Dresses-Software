import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { suppliersApi } from '../../../lib/api/suppliers';
import type { SupplierRecord } from '../../../lib/api/suppliers';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { formatINR } from '../../../lib/format/money';
import { QuickAddMaterialSheet } from '../../../components/forms/QuickAddMaterialSheet';
import { QuickAddSupplierSheet } from '../../../components/forms/QuickAddSupplierSheet';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import {
  materialsApi, materialVariantsApi, coloursApi, uomsApi, lotNumbersApi, materialCategoriesApi, problemMessage, todayISO,
  type MaterialRecord, type MaterialVariantRecord, type ColourRecord, type UomRecord, type CategoryRecord,
} from '../../../lib/api/procurement';

interface InwardLine {
  id: string;
  materialId: string;
  color: string;
  qty: string;
  rate: string;
  uomId: string;
  batchRef: string;
  /** Rolls (thans) received, metres each; when any is filled the quantity is their total. */
  thans: string[];
}

/** Offered while the colour master is still empty — any colour can be typed (new ones are added to the colour master). */
const COLOR_SUGGESTIONS = [
  'White', 'Off White', 'Cream', 'Black', 'Grey', 'Navy Blue', 'Royal Blue', 'Sky Blue',
  'Red', 'Maroon', 'Pink', 'Peach', 'Orange', 'Yellow', 'Mustard', 'Green', 'Olive',
  'Bottle Green', 'Purple', 'Lavender', 'Brown', 'Beige', 'Gold', 'Silver', 'Multicolour',
];

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

const emptyLine = (): InwardLine => ({ id: genId(), materialId: '', color: '', qty: '', rate: '', uomId: '', batchRef: '', thans: [''] });

const filledThans = (l: InwardLine) => l.thans.map(t => Number(t)).filter(t => t > 0);
/** Total received on a line: sum of its thans, or the typed quantity when no than is entered. */
const lineQty = (l: InwardLine) => {
  const t = filledThans(l);
  return t.length ? Math.round(t.reduce((a, b) => a + b, 0) * 1000) / 1000 : Number(l.qty) || 0;
};

export function DirectInwardForm() {
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [uoms, setUoms] = useState<UomRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [variants, setVariants] = useState<MaterialVariantRecord[]>([]);
  const [colours, setColours] = useState<ColourRecord[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);

  const [supplierId, setSupplierId] = useState('');
  const [inwardDate, setInwardDate] = useState(todayISO());
  const [referenceNo, setReferenceNo] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [lotNo, setLotNo] = useState('');
  /** true once the user edits the lot number themselves - stop overwriting it with suggestions. */
  const [lotEdited, setLotEdited] = useState(false);
  const [otherCharges, setOtherCharges] = useState('');
  const [lines, setLines] = useState<InwardLine[]>([emptyLine()]);

  const [showPrices, setShowPrices] = useState(true);
  const [supplierQuery, setSupplierQuery] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  /** Line waiting for a material created from the quick-add sheet. */
  const [addMaterialForLine, setAddMaterialForLine] = useState<string | null>(null);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [picker, setPicker] = useState<{ kind: 'supplier' } | { kind: 'material'; lineId: string } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    Promise.all([suppliersApi.list(), uomsApi.list(), materialsApi.list(), materialVariantsApi.list(), coloursApi.list()])
      .then(([s, u, m, v, c]) => {
        setSuppliers(s.filter(x => x.isActive));
        setUoms(u.filter(x => x.isActive));
        setMaterials(m.filter(x => x.isActive));
        setVariants(v);
        setColours(c.filter(x => x.isActive));
      })
      .catch(err => setFormError(problemMessage(err, 'Failed to load suppliers, materials or units. Please refresh.')))
      .finally(() => setLoadingRefs(false));
  }, []);

  // Suggest the supplier's next lot number (e.g. MAH-4) whenever the supplier changes.
  useEffect(() => {
    if (!supplierId || lotEdited) return;
    let alive = true;
    lotNumbersApi.nextForSupplier(supplierId)
      .then(s => { if (alive) setLotNo(s.lotNo); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [supplierId, lotEdited]);

  useEffect(() => { materialCategoriesApi.list().then(setCategories).catch(() => undefined); }, []);

  // Draft: kept on this device until the inward is saved or discarded (Back / closing never loses it).
  const draftValue = useMemo(
    () => ({ supplierId, inwardDate, referenceNo, challanNo, lotNo, lotEdited, otherCharges, lines, showPrices }),
    [supplierId, inwardDate, referenceNo, challanNo, lotNo, lotEdited, otherCharges, lines, showPrices],
  );
  const draft = useDraft('inward:direct:new', draftValue, d => {
    setSupplierId(d.supplierId); setInwardDate(d.inwardDate); setReferenceNo(d.referenceNo); setChallanNo(d.challanNo);
    setLotNo(d.lotNo); setLotEdited(d.lotEdited); setOtherCharges(d.otherCharges); setLines(d.lines); setShowPrices(d.showPrices);
  }, {
    enabled: !loadingRefs,
    isEmpty: v => !v.supplierId && !v.referenceNo && !v.challanNo && v.lines.every(l => !l.materialId && !l.qty && l.thans.every(t => !t)),
  });

  /** Dupatta always comes in white (it is dyed later), so its colour is never asked. */
  const isDupatta = (materialId: string) => {
    const m = materials.find(x => x._id === materialId);
    if (!m) return false;
    const cat = categories.find(c => c._id === m.categoryId)?.name ?? '';
    return /dupatt?a/i.test(`${m.name} ${m.fabricType ?? ''} ${cat}`);
  };

  const addLine = () => setLines(prev => [...prev, emptyLine()]);

  /** Same material in another colour: copy material, unit and rate onto a new line right below. */
  const addColourOf = (id: string) => setLines(prev => {
    const i = prev.findIndex(l => l.id === id);
    if (i < 0) return prev;
    const src = prev[i];
    const copy: InwardLine = { ...emptyLine(), materialId: src.materialId, uomId: src.uomId, rate: src.rate };
    return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
  });

  const setThan = (id: string, idx: number, value: string) => setLines(prev => prev.map(l => {
    if (l.id !== id) return l;
    const thans = [...l.thans];
    thans[idx] = value;
    return { ...l, thans };
  }));
  const addThan = (id: string) => setLines(prev => prev.map(l => (l.id === id ? { ...l, thans: [...l.thans, ''] } : l)));
  const removeThan = (id: string, idx: number) => setLines(prev => prev.map(l => (
    l.id === id ? { ...l, thans: l.thans.length > 1 ? l.thans.filter((_, j) => j !== idx) : [''] } : l
  )));

  const removeLine = (id: string) =>
    setLines(prev => prev.filter(l => l.id !== id));

  const updateLine = (id: string, field: keyof InwardLine, value: string) =>
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, [field]: value };
      if (field === 'materialId') {
        next.uomId = materials.find(m => m._id === value)?.baseUomId ?? '';
        if (isDupatta(String(value))) next.color = 'White';
      }
      return next;
    }));

  /** Colours already set up for this material first, then the colour master (or common suggestions). */
  const colourOptionsFor = (materialId: string) => {
    const own = variants.filter(v => v.materialId?._id === materialId).map(v => v.colourId?.name).filter(Boolean) as string[];
    const master = colours.length ? colours.map(c => c.name) : COLOR_SUGGESTIONS;
    return [...own, ...master.filter(n => !own.includes(n))];
  };

  const validate = () => {
    if (!supplierId) return 'Please select a supplier.';
    if (!inwardDate) return 'Please enter an inward date.';
    if (lines.length === 0) return 'Add at least one line item.';
    for (const l of lines) {
      if (!l.materialId) return 'Select the material on all lines.';
      if (!l.color.trim() && !isDupatta(l.materialId)) return 'Colour is required on all lines.';
      if (l.thans.some(t => t !== '' && !(Number(t) > 0))) return 'Each than must be a positive number of metres.';
      if (!(lineQty(l) > 0)) return 'Enter the thans (metres) or the quantity on every line.';
      if (l.rate && (isNaN(Number(l.rate)) || Number(l.rate) < 0)) return 'Rate cannot be negative.';
    }
    return null;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError('');
    setShowConfirm(true);
  };

  const confirmSave = async () => {
    setShowConfirm(false);
    setIsSaving(true);
    try {
      // Rates are kept even while "Show prices" is off — the toggle only hides them on screen.
      const body = {
        supplierId,
        supplierInvoiceNo: referenceNo.trim() || undefined,
        challanNo: challanNo.trim() || undefined,
        lotNo: lotNo.trim() || undefined,
        docDate: inwardDate,
        otherCharges: Number(otherCharges) || 0,
        lines: lines.map(l => ({
          materialId: l.materialId,
          colourName: isDupatta(l.materialId) ? 'White' : l.color.trim(),
          uomId: l.uomId || undefined,
          qty: lineQty(l),
          rate: Number(l.rate) || 0,
          thans: filledThans(l).length ? filledThans(l) : undefined,
        })),
      };
      const res = await submitOrQueue({
        method: 'POST',
        url: '/inwards/direct',
        body,
        label: `Purchase inward · ${suppliers.find(x => x._id === supplierId)?.name ?? 'supplier'} · ${lines.length} item(s)`,
      });
      draft.clear();
      if (res.queued) window.alert('No internet — this inward is saved on this phone and will be sent automatically when you are back online.');
      navigate('/procurement/inward');
    } catch (err) {
      setFormError(problemMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const selectClass = 'w-full px-3 py-2 text-sm border border-[var(--color-border)] rounded-lg bg-[var(--color-surface)] text-[var(--color-text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]';

  const selectedSupplier = suppliers.find(s => s._id === supplierId);

  const lineAmount = (l: InwardLine) => lineQty(l) * (Number(l.rate) || 0);
  const totalAmount = lines.reduce((sum, l) => sum + lineAmount(l), 0);

  const confirmMessage = [
    `Create purchase inward from ${selectedSupplier?.name ?? ''}`,
    `dated ${inwardDate}`,
    `for ${lines.length} line item(s)${showPrices && totalAmount > 0 ? ` worth ${formatINR(totalAmount)}` : ''}?`,
    'Stock is added to Main Warehouse as new lots, and a purchase record is raised automatically behind this inward.',
  ].join(' ');

  if (loadingRefs) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/procurement/inward')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">New Purchase Inward</h1>
          <p className="text-muted">Record direct receipt of raw materials from a supplier.</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      {formError && (
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{formError}</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Header */}
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2 mb-2">Inward Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <PickerField
                label={<>Supplier <span className="text-red-500">*</span></>}
                value={suppliers.find(x => x._id === supplierId)?.name}
                placeholder="Tap to choose supplier"
                onOpen={() => setPicker({ kind: 'supplier' })}
              />
              <button type="button" onClick={() => setAddSupplierOpen(true)} className="self-start text-sm font-medium text-[var(--color-primary)] min-h-10 py-2 pr-2 -my-1">
                + Add new supplier
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Inward Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                className={selectClass}
                value={inwardDate}
                onChange={e => setInwardDate(e.target.value)}
                required
              />
            </div>
            <Input
              label="Invoice No."
              value={referenceNo}
              onChange={e => setReferenceNo(e.target.value)}
              placeholder="Supplier's bill number"
            />
            <Input
              label="Challan No."
              value={challanNo}
              onChange={e => setChallanNo(e.target.value)}
              placeholder="Delivery challan number"
            />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Lot No.</label>
              <input
                className="input-field uppercase"
                value={lotNo}
                onChange={e => { setLotNo(e.target.value); setLotEdited(true); }}
                placeholder={supplierId ? 'Auto' : 'Select supplier first'}
              />
              <span className="text-xs text-muted">
                {lotEdited ? (
                  <button type="button" className="text-[var(--color-primary)] font-medium" onClick={() => setLotEdited(false)}>Use automatic number</button>
                ) : 'Filled automatically for this supplier — you can change it.'}
              </span>
            </div>
          </div>
        </Card>

        {/* Line items */}
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 mb-2">
            <h3 className="font-semibold text-lg">Materials Received</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={showPrices}
                onChange={e => setShowPrices(e.target.checked)}
              />
              Show prices
            </label>
          </div>

          <div className="flex flex-col gap-3">
            {lines.map((line, index) => (
              <div key={line.id} className="flex flex-col gap-3 p-3 md:p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Item {index + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.id)}
                      className="p-2 -m-2 text-red-400 hover:text-red-600 transition-colors"
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="col-span-2 md:col-span-3 flex flex-col gap-1">
                    <PickerField
                      label={<span className="text-xs font-medium text-muted">Material / Fabric <span className="text-red-500">*</span></span>}
                      value={materials.find(m => m._id === line.materialId)?.name}
                      placeholder="Tap to choose material"
                      onOpen={() => setPicker({ kind: 'material', lineId: line.id })}
                    />
                    <button
                      type="button"
                      onClick={() => setAddMaterialForLine(line.id)}
                      className="self-start text-sm font-medium text-[var(--color-primary)] min-h-10 py-2 pr-2 -my-1"
                    >
                      + Add new material
                    </button>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">Color <span className="text-red-500">*</span></label>
                    {isDupatta(line.materialId) ? (
                      <div className="input-field flex items-center gap-2 bg-slate-50 text-slate-600">
                        <span className="w-4 h-4 rounded-full border border-slate-300 bg-white shrink-0" />
                        White <span className="text-xs text-muted">— dupatta always comes white</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="input-field"
                        value={line.color}
                        onChange={e => updateLine(line.id, 'color', e.target.value)}
                        placeholder="e.g. Navy Blue"
                        list={`inward-color-options-${line.id}`}
                        required
                      />
                    )}
                    <datalist id={`inward-color-options-${line.id}`}>
                      {colourOptionsFor(line.materialId).map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>

                  <div className="col-span-2 md:col-span-6 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted">Thans — metres in each than <span className="text-red-500">*</span></label>
                      <span className="text-sm font-semibold tabular">
                        Total: {lineQty(line).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {uoms.find(u => u._id === line.uomId)?.code ?? ''}
                        {filledThans(line).length > 0 && <span className="text-muted font-normal"> · {filledThans(line).length} than{filledThans(line).length > 1 ? 's' : ''}</span>}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                      {line.thans.map((t, ti) => (
                        <div key={ti} className="relative">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0.001"
                            step="any"
                            className="input-field text-right pr-7"
                            value={t}
                            onChange={e => setThan(line.id, ti, e.target.value)}
                            placeholder={`Than ${ti + 1} (m)`}
                            aria-label={`Than ${ti + 1} metres`}
                          />
                          {line.thans.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeThan(line.id, ti)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500"
                              aria-label={`Remove than ${ti + 1}`}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addThan(line.id)}
                        className="min-h-10 rounded-lg border border-dashed border-[var(--color-border)] text-sm font-medium text-[var(--color-primary)]"
                      >
                        + Than
                      </button>
                    </div>
                    <span className="text-xs text-muted">Enter the metres of every than separately (e.g. 100, 89, 300). Stock is kept in metres — the total.</span>
                    {(() => {
                      const code = uoms.find(u => u._id === (line.uomId || materials.find(m => m._id === line.materialId)?.baseUomId))?.code ?? '';
                      return line.materialId && code && !/^m(tr|trs|eter|etre)?$/i.test(code) ? (
                        <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          This material is counted in <b>{code}</b>, not metres — the stock would be saved as {code}. For fabric, set its unit to Metre (Inventory → Materials) or add a new material with unit Metre.
                        </span>
                      ) : null;
                    })()}
                    {filledThans(line).length === 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted">Not in thans? Total quantity:</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.001"
                          step="any"
                          className="input-field text-right w-32"
                          value={line.qty}
                          onChange={e => updateLine(line.id, 'qty', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">Unit</label>
                    <select
                      className={selectClass}
                      value={line.uomId}
                      onChange={e => updateLine(line.id, 'uomId', e.target.value)}
                    >
                      <option value="">Base unit</option>
                      {uoms.map(u => (
                        <option key={u._id} value={u._id}>{u.name} ({u.code})</option>
                      ))}
                    </select>
                  </div>

                  {showPrices && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted">Rate (₹)</label>
                        <RestrictedValue perm="purchases.rate.view">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            className="input-field text-right"
                            value={line.rate}
                            onChange={e => updateLine(line.id, 'rate', e.target.value)}
                            placeholder="0.00"
                          />
                        </RestrictedValue>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-medium text-muted">Amount (₹)</label>
                        <div className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                          <RestrictedValue perm="purchases.rate.view">
                            {lineAmount(line).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </RestrictedValue>
                        </div>
                      </div>
                    </>
                  )}

                </div>
                {line.materialId && !isDupatta(line.materialId) && (
                  <button
                    type="button"
                    onClick={() => addColourOf(line.id)}
                    className="self-start text-sm font-medium text-[var(--color-primary)] py-1"
                  >
                    + Add another colour of {materials.find(m => m._id === line.materialId)?.name ?? 'this material'}
                  </button>
                )}
              </div>
            ))}

            <Button type="button" variant="secondary" onClick={addLine} className="w-full md:w-auto md:self-start">
              <Plus size={16} /> Add Another Item
            </Button>
          </div>

          {showPrices && (
            <div className="flex flex-col md:flex-row md:justify-end gap-3 pt-2">
              <div className="w-full md:w-60">
                <RestrictedValue perm="purchases.rate.view">
                  <Input
                    label="Expenses (if any) — freight, etc."
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={otherCharges}
                    onChange={e => setOtherCharges(e.target.value)}
                    placeholder="0"
                  />
                </RestrictedValue>
              </div>
              <div className="bg-[var(--color-background)] p-4 rounded-lg border border-[var(--color-border)] w-full md:w-72 text-right">
                <span className="text-muted text-sm block">Total Inward Value</span>
                <RestrictedValue perm="purchases.rate.view">
                  <span className="text-2xl font-bold text-primary">{formatINR(totalAmount)}</span>
                  {Number(otherCharges) > 0 && <span className="text-xs text-muted block">+ expenses {formatINR(Number(otherCharges))}, spread over lots by value</span>}
                </RestrictedValue>
              </div>
            </div>
          )}
        </Card>

        {/* Traceability notice */}
        <Card className="bg-[#FFF0F3] border-[#FFDCE5] p-4">
          <p className="text-sm text-[#8F002B]">
            <strong>Traceability:</strong> Upon confirmation, unique Lot Numbers will be generated for each line item for warehouse tracking.
          </p>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 sticky bottom-0 bg-[var(--color-background)] p-4 border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6">
          <Button type="button" variant="secondary" onClick={() => navigate('/procurement/inward')}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving}>
            Confirm Inward & Generate Lots
          </Button>
        </div>
      </form>

      <PickerSheet
        open={picker?.kind === 'supplier'}
        title="Choose supplier"
        items={suppliers.map((x): PickerItem => ({ id: x._id, title: x.name, subtitle: [x.contactPerson, x.mobile, x.gstin].filter(Boolean).join(' · '), keywords: `${x.mobile ?? ''} ${x.gstin ?? ''}` }))}
        selectedId={supplierId}
        searchPlaceholder="Search supplier, mobile or GSTIN…"
        onSelect={it => { setSupplierId(it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
        onCreate={q => { setPicker(null); setSupplierQuery(q); setAddSupplierOpen(true); }}
        createLabel="supplier"
      />
      <PickerSheet
        open={picker?.kind === 'material'}
        title="Choose material"
        items={materials.map((m): PickerItem => ({
          id: m._id,
          title: m.name,
          subtitle: [categories.find(c => c._id === m.categoryId)?.name, m.fabricType, uoms.find(u => u._id === m.baseUomId)?.code].filter(Boolean).join(' · '),
          badge: isDupatta(m._id) ? 'Dupatta' : undefined,
        }))}
        selectedId={picker?.kind === 'material' ? lines.find(l => l.id === picker.lineId)?.materialId : undefined}
        searchPlaceholder="Search material…"
        onSelect={it => { if (picker?.kind === 'material') updateLine(picker.lineId, 'materialId', it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
        onCreate={q => { const lineId = picker?.kind === 'material' ? picker.lineId : null; setPicker(null); setMaterialQuery(q); if (lineId) setAddMaterialForLine(lineId); }}
        createLabel="material"
      />

      <QuickAddSupplierSheet
        open={addSupplierOpen}
        initialName={supplierQuery}
        onClose={() => setAddSupplierOpen(false)}
        onCreated={s => {
          setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)));
          setSupplierId(s._id);
          setAddSupplierOpen(false);
        }}
      />

      <QuickAddMaterialSheet
        open={addMaterialForLine !== null}
        initialName={materialQuery}
        uoms={uoms}
        onClose={() => setAddMaterialForLine(null)}
        onCreated={material => {
          const lineId = addMaterialForLine;
          setMaterials(prev => [...prev, material].sort((a, b) => a.name.localeCompare(b.name)));
          setAddMaterialForLine(null);
          if (lineId) {
            setLines(prev => prev.map(l => (l.id === lineId ? { ...l, materialId: material._id, uomId: material.baseUomId } : l)));
          }
        }}
      />

      <ConfirmDialog
        open={showConfirm}
        title="Confirm Purchase Inward"
        impact={confirmMessage}
        confirmLabel="Confirm Inward"
        isLoading={isSaving}
        onConfirm={confirmSave}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
