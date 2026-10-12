import { useState, useEffect, useMemo, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { formatINR } from '../../../lib/format/money';
import { suppliersApi } from '../../../lib/api/suppliers';
import { PickerSheet, PickerField } from '../../../components/forms/PickerSheet';
import { ColourPickerField } from '../../../components/forms/ColourPickerField';
import { QuickAddMasterSheet } from '../../../components/forms/QuickAddMasterSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import {
  purchasesApi, materialVariantsApi, uomsApi, coloursApi, locationsApi, problemMessage, todayISO,
  type Purchase, type MaterialVariantRecord, type UomRecord, type ColourRecord, type LocationRecord,
} from '../../../lib/api/procurement';

interface InwardItem {
  purchaseLineId: string;
  materialId: string;
  materialName: string;
  orderedColour: string;
  color: string;
  orderedQty: number;
  previouslyReceived: number;
  receivingQty: number;
  uom: string;
  /** PO line rate (₹ per uom) — read-only here, set on the Purchase Order. */
  rate: number;
  lotNo: string;
}

export function InwardForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // PO ID

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPrices, setShowPrices] = useState(true);
  const [error, setError] = useState('');

  const [po, setPo] = useState<Purchase | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [variants, setVariants] = useState<MaterialVariantRecord[]>([]);
  const [colours, setColours] = useState<ColourRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [items, setItems] = useState<InwardItem[]>([]);
  const [inwardDate, setInwardDate] = useState(todayISO());
  const [supplierRef, setSupplierRef] = useState('');
  const [locationId, setLocationId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [locPickerOpen, setLocPickerOpen] = useState(false);
  const [addLocation, setAddLocation] = useState<string | null>(null);
  const [queuedMsg, setQueuedMsg] = useState('');

  // What was typed so far is kept on this device if the page is left by mistake.
  const draftValue = useMemo(
    () => ({ inwardDate, supplierRef, locationId, remarks, lines: items.map(i => ({ id: i.purchaseLineId, color: i.color, qty: i.receivingQty, lotNo: i.lotNo })) }),
    [inwardDate, supplierRef, locationId, remarks, items],
  );
  type InwardDraft = typeof draftValue;
  /** The form as loaded from the PO - an unchanged form is not kept as a draft. */
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoading && po && baseline.current === null) baseline.current = JSON.stringify(draftValue);
  }, [isLoading, po, draftValue]);
  const applyDraft = (d: InwardDraft) => {
    setInwardDate(d.inwardDate); setSupplierRef(d.supplierRef); setRemarks(d.remarks);
    if (d.locationId) setLocationId(d.locationId);
    const byId = new Map(d.lines.map(l => [l.id, l]));
    setItems(prev => prev.map(i => { const l = byId.get(i.purchaseLineId); return l ? { ...i, color: l.color, receivingQty: l.qty, lotNo: l.lotNo } : i; }));
  };
  const draft = useDraft(`inward:po:${id ?? ''}`, draftValue, applyDraft, {
    enabled: !isLoading && !!po,
    isEmpty: v => JSON.stringify(v) === baseline.current,
  });

  useEffect(() => {
    if (!id) return;
    let active = true;
    (async () => {
      try {
        const [p, sups, vs, us, cs, locs] = await Promise.all([
          purchasesApi.get(id), suppliersApi.list(), materialVariantsApi.list(), uomsApi.list(), coloursApi.list(), locationsApi.list(),
        ]);
        if (!active) return;
        const vMap = new Map(vs.map(v => [v._id, v]));
        const uMap = new Map((us as UomRecord[]).map(u => [u._id, u]));
        setPo(p);
        setVariants(vs);
        setColours(cs);
        const receiving = locs.filter(l => l.kind === 'WAREHOUSE' || l.kind === 'QUARANTINE');
        setLocations(receiving);
        setLocationId(receiving.find(l => l.code === 'MAIN-WH')?._id ?? receiving[0]?._id ?? '');
        setSupplierName(sups.find(s => s._id === p.supplierId)?.name ?? '');
        setItems(p.lines.map(l => {
          const v = vMap.get(l.materialVariantId);
          // qtyBase/qtyReceivedBase are in base units; show in the PO line's unit.
          const factor = l.qty > 0 ? l.qtyBase / l.qty : 1;
          const received = factor > 0 ? l.qtyReceivedBase / factor : 0;
          const pending = Math.max(0, +(l.qty - received).toFixed(3));
          return {
            purchaseLineId: l._id,
            materialId: v?.materialId?._id ?? '',
            materialName: v?.materialId?.name ?? 'Material',
            orderedColour: v?.colourId?.name ?? '',
            color: v?.colourId?.name ?? '',
            orderedQty: l.qty,
            previouslyReceived: +received.toFixed(3),
            receivingQty: pending,
            uom: uMap.get(l.uomId)?.code ?? '',
            rate: l.rate,
            lotNo: '',
          };
        }));
      } catch (err) {
        if (active) setError(problemMessage(err, 'Could not load the purchase order.'));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const update = (lineId: string, patch: Partial<InwardItem>) =>
    setItems(prev => prev.map(item => item.purchaseLineId === lineId ? { ...item, ...patch } : item));

  const colourOptionsFor = useMemo(() => (materialId: string) => {
    const own = variants.filter(v => v.materialId?._id === materialId).map(v => v.colourId?.name).filter(Boolean) as string[];
    return [...own, ...colours.map(c => c.name).filter(n => !own.includes(n))];
  }, [variants, colours]);

  const toReceive = items.filter(i => i.receivingQty > 0);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (toReceive.length === 0) { setError('Enter a receiving quantity on at least one line.'); return; }
    const over = toReceive.find(i => i.receivingQty > i.orderedQty - i.previouslyReceived + 0.0005);
    if (over) { setError(`${over.materialName}: receiving ${over.receivingQty} is more than the ${+(over.orderedQty - over.previouslyReceived).toFixed(3)} ${over.uom} still pending. The server allows only the configured over-receipt tolerance.`); }
    else setError('');
    if (toReceive.some(i => !i.color.trim())) { setError('Colour is required on every line being received.'); return; }
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    if (!po) return;
    setShowConfirm(false);
    setIsSaving(true);
    try {
      const res = await submitOrQueue({ method: 'POST', url: '/inwards', label: `Inward · ${po.docNo} · ${supplierName || 'supplier'} · ${toReceive.length} line${toReceive.length === 1 ? '' : 's'}`, body: {
        purchaseId: po._id,
        locationId: locationId || undefined,
        docDate: inwardDate || undefined,
        supplierRef: supplierRef.trim() || undefined,
        remarks: remarks.trim() || undefined,
        confirm: true,
        lines: toReceive.map(i => ({
          purchaseLineId: i.purchaseLineId,
          qty: i.receivingQty,
          lotNo: i.lotNo.trim() || undefined,
          // Only send a colour when it differs from what was ordered (a different shade arrived).
          colourName: i.color.trim().toLowerCase() !== i.orderedColour.toLowerCase() ? i.color.trim() : undefined,
        })),
      } });
      draft.clear();
      if (res.queued) {
        setQueuedMsg("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/procurement/inward'), 1800);
        return;
      }
      navigate('/procurement/inward');
    } catch (err) {
      setError(problemMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const receivingSummary = toReceive
    .map(item => `${item.receivingQty} ${item.uom} of ${item.materialName}${item.color ? ` (${item.color})` : ''}`)
    .join(', ');
  const receivingValue = items.reduce((sum, item) => sum + item.receivingQty * (item.rate ?? 0), 0);
  const locationName = locations.find(l => l._id === locationId)?.name ?? 'Main Warehouse';

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const receivable = po && (po.status === 'CONFIRMED' || po.status === 'PARTIALLY_RECEIVED');

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/procurement/inward')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Inward Material</h1>
          <p className="text-muted">Receiving items for {po?.docNo ?? '—'} ({supplierName})</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); if (baseline.current) applyDraft(JSON.parse(baseline.current) as InwardDraft); }} />

      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {po && !receivable && (
        <p className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          This purchase order is {po.status.replace('_', ' ').toLowerCase()} — material can only be received against a confirmed, not fully received PO.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2 mb-2">Inward Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Inward Date</label>
              <input type="date" className="input-field" value={inwardDate} onChange={e => setInwardDate(e.target.value)} required />
            </div>
            <Input label="Supplier Challan / Invoice Ref" value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="optional" />
            <PickerField
              label="Receive Into"
              value={locations.find(l => l._id === locationId)?.name}
              hint={locations.find(l => l._id === locationId)?.code}
              placeholder="Tap to choose location"
              onOpen={() => setLocPickerOpen(true)}
            />
          </div>
          <Input label="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="optional" />
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2 mb-2">
            <h3 className="font-semibold text-lg">Items to Receive</h3>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none py-1">
              <input type="checkbox" className="w-4 h-4" checked={showPrices} onChange={e => setShowPrices(e.target.checked)} />
              Show prices
            </label>
          </div>

          <div className="flex flex-col gap-3">
            {items.map((item) => {
              const pending = Math.max(0, +(item.orderedQty - item.previouslyReceived).toFixed(3));
              return (
                <div key={item.purchaseLineId} className="flex flex-col gap-3 p-3 md:p-4 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                  <div className="font-semibold">{item.materialName}{item.orderedColour ? ` — ordered ${item.orderedColour}` : ''}</div>

                  <div className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-2">
                      <span className="block text-xs text-muted">Ordered</span>
                      <span className="font-medium">{item.orderedQty} {item.uom}</span>
                    </div>
                    <div className="rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] p-2">
                      <span className="block text-xs text-muted">Received</span>
                      <span className="font-medium">{item.previouslyReceived} {item.uom}</span>
                    </div>
                    <div className="rounded-md bg-yellow-50 border border-yellow-200 p-2">
                      <span className="block text-xs text-muted">Pending</span>
                      <span className="font-semibold text-yellow-700">{pending} {item.uom}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted">Colour received</label>
                      <ColourPickerField
                        options={colourOptionsFor(item.materialId)}
                        value={item.color}
                        onChange={c => update(item.purchaseLineId, { color: c })}
                        placeholder="Choose colour"
                        disabled={pending <= 0}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted">Receive Qty ({item.uom})</label>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.001"
                        className="input-field text-right"
                        value={item.receivingQty === 0 ? '' : item.receivingQty}
                        onChange={(e) => update(item.purchaseLineId, { receivingQty: parseFloat(e.target.value) || 0 })}
                        disabled={pending <= 0}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted">Batch / Lot (optional)</label>
                      <input
                        type="text"
                        className="input-field"
                        value={item.lotNo}
                        onChange={(e) => update(item.purchaseLineId, { lotNo: e.target.value })}
                        placeholder="auto if blank"
                        disabled={pending <= 0}
                      />
                    </div>
                    {showPrices && (
                      <>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-muted">PO Rate (₹ / {item.uom})</label>
                          <div className="px-3 py-2 text-right text-muted whitespace-nowrap">
                            <RestrictedValue perm="purchases.rate.view">
                              {(item.rate ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </RestrictedValue>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-medium text-muted">Amount (₹)</label>
                          <div className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                            <RestrictedValue perm="purchases.rate.view">
                              {(item.receivingQty * (item.rate ?? 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </RestrictedValue>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showPrices && (
            <div className="flex justify-end pt-2">
              <div className="bg-[var(--color-background)] p-4 rounded-lg border border-[var(--color-border)] w-full md:w-72 text-right">
                <span className="text-muted text-sm block">Value Being Received</span>
                <RestrictedValue perm="purchases.rate.view">
                  <span className="text-2xl font-bold text-primary">{formatINR(receivingValue)}</span>
                </RestrictedValue>
                <span className="text-xs text-muted block mt-1">At Purchase Order rates (lots carry the landed cost incl. expenses)</span>
              </div>
            </div>
          )}
        </Card>

        <Card className="bg-[#FFF0F3] border-[#FFDCE5] flex gap-4 p-4 items-start">
          <CheckCircle className="text-[#E40043] mt-1 flex-shrink-0" size={20} />
          <div>
            <h4 className="font-semibold text-[#5E001C]">Traceability Notice</h4>
            <p className="text-sm text-[#8F002B] mt-1">
              On confirmation each received line becomes a new <strong>lot</strong> in {locationName}, carrying the PO line's landed unit cost. A blank batch gets an automatic lot number.
            </p>
          </div>
        </Card>

        <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 z-10 bg-[var(--color-background)]/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6">
          <Button type="button" variant="secondary" onClick={() => navigate('/procurement/inward')}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} disabled={!receivable}>
            Confirm Inward & Generate Lots
          </Button>
        </div>
      </form>

      <PickerSheet
        open={locPickerOpen}
        title="Receive into"
        items={locations.map(l => ({ id: l._id, title: l.name, subtitle: `${l.code} · ${l.kind === 'QUARANTINE' ? 'Quarantine' : 'Warehouse'}`, keywords: l.code }))}
        selectedId={locationId}
        searchPlaceholder="Search warehouse…"
        onSelect={it => { setLocationId(it.id); setLocPickerOpen(false); }}
        onClose={() => setLocPickerOpen(false)}
        createLabel="warehouse"
        onCreate={q => { setLocPickerOpen(false); setAddLocation(q); }}
      />
      <QuickAddMasterSheet
        open={addLocation !== null}
        noun="warehouse"
        endpoint="/locations"
        withCode
        extraBody={{ kind: 'WAREHOUSE' }}
        initialName={addLocation ?? ''}
        namePlaceholder="e.g. Godown 2"
        onClose={() => setAddLocation(null)}
        onCreated={r => {
          const loc = { _id: r._id, name: r.name, code: r.code ?? '', kind: 'WAREHOUSE', isActive: true } as LocationRecord;
          setLocations(prev => [...prev, loc]);
          setLocationId(loc._id);
          setAddLocation(null);
        }}
      />

      <ConfirmDialog
        open={showConfirm}
        title="Confirm Inward"

        impact={`Confirm inward and add ${receivingSummary || 'the entered quantities'} to raw material stock at ${locationName}? Lot numbers will be generated for traceability.`}
        confirmLabel="Confirm Inward"
        isLoading={isSaving}
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
