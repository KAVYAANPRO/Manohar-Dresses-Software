import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import {
  designsApi, productionOrdersApi, lookupsApi, toProblem, fmtDate, fmtQty,
  type DesignRecord, type NamedRecord, type RequirementByMaterial, type ProductionOrderRecord,
} from '../../../lib/api/production';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { QuickAddDesignSheet } from '../../../components/forms/QuickAddDesignSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

function MaterialCards({ rows }: { rows: RequirementByMaterial[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map(line => {
        const ok = line.shortfall <= 0;
        const partialOk = !ok && line.availableQtyBase > 0;
        const surplus = line.availableQtyBase - line.requiredQtyBase;
        return (
          <div key={line.materialVariantId} className={`rounded-lg p-3 md:p-4 border ${ok ? 'bg-green-50 border-green-200' : partialOk ? 'bg-orange-50 border-orange-200' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="text-sm font-medium text-slate-900">{line.materialName}</div>
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${ok ? 'text-green-700' : partialOk ? 'text-orange-700' : 'text-red-700'}`}>
                {ok ? <><CheckCircle size={14} /> Available</> : partialOk ? <><AlertTriangle size={14} /> Partial shortfall</> : <><XCircle size={14} /> Out of stock</>}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-white/60 rounded p-2">
                <div className="text-slate-400 mb-0.5">Required</div>
                <div className="font-bold text-slate-900">{fmtQty(line.requiredQtyBase)} {line.uom}</div>
              </div>
              <div className="bg-white/60 rounded p-2">
                <div className="text-slate-400 mb-0.5">In warehouse</div>
                <div className="font-bold text-slate-900">{fmtQty(line.availableQtyBase)} {line.uom}</div>
              </div>
              <div className="bg-white/60 rounded p-2">
                <div className="text-slate-400 mb-0.5">{ok ? 'Surplus' : 'Shortfall'}</div>
                <div className={`font-bold ${ok ? 'text-green-700' : 'text-red-600'}`}>
                  {ok ? `+${fmtQty(surplus)}` : `−${fmtQty(line.shortfall)}`} {line.uom}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProductionRequirementForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isViewing = Boolean(id);

  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [colours, setColours] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [designId, setDesignId] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({}); // key colourId|sizeId
  const [plannedStartDate, setPlannedStartDate] = useState('');
  const [plannedEndDate, setPlannedEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [preview, setPreview] = useState<RequirementByMaterial[] | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [order, setOrder] = useState<ProductionOrderRecord | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [designPickerOpen, setDesignPickerOpen] = useState(false);
  const [addDesign, setAddDesign] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const draft = useDraft(
    'production-requirement:new',
    { designId, qty, plannedStartDate, plannedEndDate, notes },
    d => { setDesignId(d.designId); setQty(d.qty ?? {}); setPlannedStartDate(d.plannedStartDate); setPlannedEndDate(d.plannedEndDate); setNotes(d.notes); },
    { enabled: !isLoading && !id, isEmpty: d => !d.designId && !d.plannedStartDate && !d.notes.trim() },
  );

  useEffect(() => {
    const loads: Promise<unknown>[] = [
      designsApi.list().then(d => setDesigns(d)),
      lookupsApi.colours().then(setColours),
      lookupsApi.sizes().then(setSizes),
    ];
    if (id) loads.push(productionOrdersApi.get(id).then(setOrder));
    Promise.all(loads)
      .catch(err => setLoadError(toProblem(err, 'Could not load.').detail))
      .finally(() => setIsLoading(false));
  }, [id]);

  const design = designs.find(d => d._id === designId);
  const total = Object.values(qty).reduce((s, v) => s + (parseInt(v) || 0), 0);
  const cName = (cid: string) => colours.find(c => c._id === String(cid))?.name ?? '?';
  const sName = (sid: string) => sizes.find(s => s._id === String(sid))?.name ?? '?';

  useEffect(() => {
    if (!designId || total <= 0) { setPreview(null); setPreviewError(''); return; }
    const t = setTimeout(() => {
      designsApi.requirements(designId, total)
        .then(r => { setPreview(r.byMaterial); setPreviewError(''); })
        .catch(err => { setPreview(null); setPreviewError(toProblem(err).detail); });
    }, 300);
    return () => clearTimeout(t);
  }, [designId, total]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!designId) { setSaveError('Select a design.'); return; }
    const quantities = Object.entries(qty)
      .map(([k, v]) => ({ colourId: k.split('|')[0], sizeId: k.split('|')[1], qty: parseInt(v) || 0 }))
      .filter(q => q.qty > 0);
    if (quantities.length === 0) { setSaveError('Enter a quantity for at least one colour/size.'); return; }
    if (!plannedStartDate) { setSaveError('Planned start date is required.'); return; }
    setIsSaving(true);
    try {
      const res = await submitOrQueue<ProductionOrderRecord>({
        method: 'POST',
        url: '/production-orders',
        label: `Production requirement · ${design ? design.designNo : 'design'} · ${total} pcs`,
        body: {
          designId,
          quantities,
          plannedStartDate,
          plannedEndDate: plannedEndDate || undefined,
          notes: notes || undefined,
        },
      });
      draft.clear();
      if (res.queued) {
        setNotice("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/production/requirements'), 1800);
        return;
      }
      navigate(`/production/requirements/${res.data._id}`, { replace: true });
    } catch (err) {
      setSaveError(toProblem(err, 'Could not save the requirement.').detail);
    } finally {
      setIsSaving(false);
    }
  };

  const doCancel = async () => {
    if (!order || !cancelReason.trim()) return;
    setIsSaving(true);
    try {
      await productionOrdersApi.cancel(order._id, cancelReason.trim());
      setOrder(await productionOrdersApi.get(order._id));
      setShowCancel(false);
    } catch (err) {
      setSaveError(toProblem(err).detail);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  }

  const header = (title: string, sub: string) => (
    <div className="flex items-center gap-3">
      <button onClick={() => navigate('/production/requirements')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
        <ArrowLeft size={20} />
      </button>
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{sub}</p>
      </div>
    </div>
  );

  // ---- View an existing requirement (snapshot; never edited) ----
  if (isViewing) {
    if (!order) return <div className="p-6 text-slate-500">{loadError || 'Requirement not found.'}</div>;
    const d = designs.find(x => x._id === String(order.designId));
    return (
      <div className="flex flex-col gap-6 max-w-3xl">
        {header(order.docNo, `${d ? `${d.designNo} — ${d.name}` : 'Design'} · ${order.totalGarments.toLocaleString('en-IN')} pcs`)}
        {saveError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{saveError}</div>}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-semibold text-slate-900">Production Plan</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${order.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' : order.stockCheckPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {order.status === 'CANCELLED' ? 'Cancelled' : order.stockCheckPassed ? 'Stock OK' : 'Shortfall'}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-slate-400">Date</div><div className="font-medium">{fmtDate(order.docDate)}</div></div>
            <div><div className="text-xs text-slate-400">Planned start</div><div className="font-medium">{fmtDate(order.plannedStartDate)}</div></div>
            <div><div className="text-xs text-slate-400">Planned end</div><div className="font-medium">{fmtDate(order.plannedEndDate)}</div></div>
            <div><div className="text-xs text-slate-400">Total</div><div className="font-medium">{order.totalGarments} pcs</div></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {order.quantities.map(q => (
              <span key={q._id} className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm">{cName(q.colourId)} / {sName(q.sizeId)}: <b>{q.qty}</b></span>
            ))}
          </div>
          {order.notes && <p className="text-sm text-slate-600">{order.notes}</p>}
          {order.cancelReason && <p className="text-sm text-red-600">Cancelled: {order.cancelReason}</p>}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-slate-900">Material Requirements</h3>
            <p className="text-xs text-slate-400 mt-0.5">BOM frozen when this requirement was created, compared with the main warehouse right now.</p>
          </div>
          <MaterialCards rows={order.byMaterial} />
        </div>
        {order.status !== 'CANCELLED' && (
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => navigate(`/production/job-slips/new-from-design?productionOrderId=${order._id}`)} className="w-full sm:w-auto">Create Job Slip</Button>
            <Button variant="secondary" onClick={() => setShowCancel(true)} className="w-full sm:w-auto">Cancel Requirement</Button>
          </div>
        )}
        <ConfirmDialog
          open={showCancel}
          title="Cancel this requirement?"
          impact={
            <div className="flex flex-col gap-2">
              <span>Job slips already created from it are not affected.</span>
              <input className="input-field" placeholder="Reason (required)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            </div>
          }
          danger
          confirmDisabled={!cancelReason.trim()}
          confirmLabel="Cancel Requirement"
          isLoading={isSaving}
          onConfirm={doCancel}
          onCancel={() => setShowCancel(false)}
        />
      </div>
    );
  }

  // ---- New requirement ----
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {header('New Production Requirement', 'Define what to produce and how many. Stock availability is checked against the BOM.')}
      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setDesignId(''); setQty({}); setPlannedStartDate(''); setPlannedEndDate(''); setNotes(''); }} />
      {notice && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{notice}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
          <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-3">Production Plan</h3>

          <PickerField
            label={<span className="text-slate-700">Design *</span>}
            value={design ? design.designNo : undefined}
            hint={design ? `Design ${design.designNo}` : undefined}
            placeholder="Tap to choose design"
            onOpen={() => setDesignPickerOpen(true)}
          />

          {design && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Quantity by colour and size (pcs) *</label>
              <div className="flex flex-col gap-3">
                {design.colourOptions.map(cid => (
                  <div key={String(cid)} className="border border-slate-200 rounded-lg p-3">
                    <div className="text-sm font-medium text-slate-800 mb-2">{cName(String(cid))}</div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {design.sizeOptions.map(sid => {
                        const key = `${cid}|${sid}`;
                        return (
                          <label key={key} className="flex flex-col gap-1 text-xs text-slate-500">
                            {sName(String(sid))}
                            <input type="number" inputMode="numeric" min="0" className="input-field w-full" value={qty[key] ?? ''} onChange={e => setQty(q => ({ ...q, [key]: e.target.value }))} />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-sm text-slate-600">Total: <b>{total.toLocaleString('en-IN')}</b> pcs</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Planned Start Date" type="date" value={plannedStartDate} onChange={e => setPlannedStartDate(e.target.value)} required />
            <Input label="Planned End Date" type="date" value={plannedEndDate} onChange={e => setPlannedEndDate(e.target.value)} min={plannedStartDate || undefined} />
          </div>
          <Input label="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {designId && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-slate-900">Material Requirements</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {total > 0 ? `Calculated for ${total.toLocaleString('en-IN')} garments from the current BOM (incl. allowance).` : 'Enter quantities above to see required materials.'}
              </p>
            </div>
            {previewError && <p className="text-sm text-red-600">{previewError}</p>}
            {preview && <MaterialCards rows={preview} />}
          </div>
        )}

        {saveError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{saveError}</div>}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button type="submit" variant="primary" isLoading={isSaving} className="w-full sm:w-auto">Save Requirement</Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/production/requirements')} className="w-full sm:w-auto">Cancel</Button>
        </div>
      </form>

      <PickerSheet
        open={designPickerOpen}
        title="Choose design"
        items={designs.filter(d => d.isActive).map((d): PickerItem => ({
          id: d._id,
          title: d.designNo,
          subtitle: [`Design ${d.designNo}`, d.colourOptions?.length ? `${d.colourOptions.length} colours` : '', d.sizeOptions?.length ? `${d.sizeOptions.length} sizes` : ''].filter(Boolean).join(' · '),
          keywords: d.designNo,
        }))}
        selectedId={designId}
        searchPlaceholder="Search design no. or name…"
        onSelect={it => { if (it.id !== designId) { setDesignId(it.id); setQty({}); } setDesignPickerOpen(false); }}
        onClose={() => setDesignPickerOpen(false)}
        createLabel="design"
        onCreate={q => { setDesignPickerOpen(false); setAddDesign(q); }}
      />
      <QuickAddDesignSheet
        open={addDesign !== null}
        initialName={addDesign ?? ''}
        onClose={() => setAddDesign(null)}
        onCreated={d => { setDesigns(prev => [...prev, d]); setDesignId(d._id); setQty({}); setAddDesign(null); }}
      />

    </div>
  );
}
