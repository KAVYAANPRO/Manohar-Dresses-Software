import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { Can, RestrictedValue } from '../../../lib/permissions/Can';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { QuickAddSupplierSheet } from '../../../components/forms/QuickAddSupplierSheet';
import { QuickAddMasterSheet } from '../../../components/forms/QuickAddMasterSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { suppliersApi, type SupplierRecord } from '../../../lib/api/suppliers';
import {
  purchaseReturnsApi, inwardsApi, materialVariantsApi, locationsApi, problemMessage, formatDate, variantLabel,
  type Inward, type Returnable, type PurchaseReturn, type MaterialVariantRecord, type LocationRecord,
} from '../../../lib/api/procurement';

function inr(n: number) { return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
const q3 = (n: number) => (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });

export function PurchaseReturnForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const isView = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [inwards, setInwards] = useState<Inward[]>([]);
  const [variants, setVariants] = useState<MaterialVariantRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);

  const [supplierId, setSupplierId] = useState('');
  const [inwardId, setInwardId] = useState(params.get('inwardId') ?? '');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [remarks, setRemarks] = useState('');
  const [returnable, setReturnable] = useState<Returnable | null>(null);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [loadingLines, setLoadingLines] = useState(false);

  const [doc, setDoc] = useState<PurchaseReturn | null>(null);
  const [showConfirm, setShowConfirm] = useState<null | 'draft' | 'confirm'>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [picker, setPicker] = useState<null | 'supplier' | 'inward' | 'location'>(null);
  const [quickAdd, setQuickAdd] = useState<null | { kind: 'supplier' | 'location'; name: string }>(null);
  const [queuedMsg, setQueuedMsg] = useState('');

  // A new return being filled in is kept on this device if the page is left by mistake.
  const draft = useDraft(
    `purchase-return:new${params.get('inwardId') ? `:${params.get('inwardId')}` : ''}`,
    { supplierId, inwardId, locationId, reason, remarks, qtys },
    d => { setSupplierId(d.supplierId); setInwardId(d.inwardId); setLocationId(d.locationId); setReason(d.reason); setRemarks(d.remarks); setQtys(d.qtys ?? {}); },
    { enabled: !loading && !isView, isEmpty: d => !d.reason.trim() && !d.remarks.trim() && !Object.values(d.qtys).some(v => Number(v) > 0) },
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [s, i, v, l] = await Promise.all([suppliersApi.list(), inwardsApi.list({ status: 'CONFIRMED' }), materialVariantsApi.list(), locationsApi.list()]);
        if (!active) return;
        setSuppliers(s); setInwards(i); setVariants(v);
        setLocations(l.filter(x => x.kind === 'WAREHOUSE' || x.kind === 'QUARANTINE'));
        if (id) {
          const d = await purchaseReturnsApi.get(id);
          if (!active) return;
          setDoc(d);
        } else if (params.get('inwardId')) {
          const inw = i.find(x => x._id === params.get('inwardId'));
          if (inw) setSupplierId(inw.supplierId);
        }
      } catch (err) {
        if (active) setError(problemMessage(err, 'Could not load data.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id, params]);

  useEffect(() => {
    if (isView || !inwardId) { setReturnable(null); return; }
    let active = true;
    setLoadingLines(true);
    purchaseReturnsApi.returnable(inwardId, locationId || undefined)
      .then(r => { if (active) { setReturnable(r); if (!locationId) setLocationId(r.locationId); } })
      .catch(err => active && setError(problemMessage(err)))
      .finally(() => active && setLoadingLines(false));
    return () => { active = false; };
  }, [inwardId, locationId, isView]);

  const variantById = useMemo(() => new Map(variants.map(v => [v._id, v])), [variants]);
  const supplierName = (sid?: string) => suppliers.find(s => s._id === sid)?.name ?? '—';
  const supplierInwards = inwards.filter(i => !supplierId || i.supplierId === supplierId);

  const chosen = (returnable?.lines ?? [])
    .map(l => ({ ...l, qty: Number(qtys[l.inwardLineId]) || 0 }))
    .filter(l => l.qty > 0);
  const total = chosen.reduce((s, l) => s + l.qty * l.unitCost, 0);

  const validate = () => {
    if (!inwardId) return 'Select the inward the goods came in on.';
    if (chosen.length === 0) return 'Enter a return quantity on at least one lot.';
    const over = chosen.find(l => l.qty > l.maxReturnQty + 0.0005);
    if (over) return `Lot ${over.lotNo}: at most ${q3(over.maxReturnQty)} can be returned (received ${q3(over.received)}, already returned ${q3(over.alreadyReturned)}, on hand ${q3(over.onHand)}).`;
    if (!reason.trim()) return 'Reason is required.';
    return null;
  };

  const submit = async (confirm: boolean) => {
    setShowConfirm(null);
    setSaving(true);
    try {
      const inw = inwards.find(i => i._id === inwardId);
      const res = await submitOrQueue<PurchaseReturn>({
        method: 'POST',
        url: '/purchase-returns',
        label: `Purchase return · ${supplierName(supplierId || returnable?.supplierId)} · ${inw?.docNo ?? 'inward'} · ${chosen.length} lot${chosen.length === 1 ? '' : 's'}`,
        body: {
          inwardId, locationId: locationId || undefined, reason: reason.trim(), remarks: remarks.trim() || undefined, confirm,
          lines: chosen.map(l => ({ inwardLineId: l.inwardLineId, qty: l.qty })),
        },
      });
      draft.clear();
      if (res.queued) {
        setQueuedMsg("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/procurement/returns'), 1800);
        return;
      }
      navigate(`/procurement/returns/${res.data._id}`, { replace: true });
    } catch (err) {
      setError(problemMessage(err));
    } finally { setSaving(false); }
  };

  const confirmExisting = async () => {
    if (!doc) return;
    setShowConfirm(null);
    setSaving(true);
    try { setDoc(await purchaseReturnsApi.confirm(doc._id)); setError(''); }
    catch (err) { setError(problemMessage(err)); }
    finally { setSaving(false); }
  };

  const cancelExisting = async () => {
    if (!doc) return;
    setSaving(true);
    try { setDoc(await purchaseReturnsApi.cancel(doc._id, cancelReason.trim())); setShowCancel(false); setError(''); }
    catch (err) { setShowCancel(false); setError(problemMessage(err)); }
    finally { setSaving(false); }
  };

  const inputClass = 'w-full px-3 py-2 text-base md:text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';

  if (loading) {
    return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  // ---------- view an existing return ----------
  if (isView) {
    if (!doc) return <p className="text-red-600 text-sm">{error || 'Purchase return not found.'}</p>;
    const inw = inwards.find(i => i._id === doc.inwardId);
    const loc = locations.find(l => l._id === doc.locationId);
    return (
      <div className="flex flex-col gap-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/procurement/returns')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold">{doc.docNo}</h1>
            <p className="text-muted">{supplierName(doc.supplierId)} · {formatDate(doc.docDate)} · {doc.status === 'CONFIRMED' ? `Debit note ${doc.debitNoteNo}` : doc.status === 'DRAFT' ? 'Draft — stock not yet moved' : 'Cancelled'}</p>
          </div>
        </div>
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
        {doc.status === 'CANCELLED' && <p className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">Cancelled{doc.cancelReason ? ` — ${doc.cancelReason}` : ''}. Any stock it had sent back was reversed into stock.</p>}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><div className={labelClass}>Inward</div><div className="font-mono">{inw?.docNo ?? '—'}</div></div>
          <div><div className={labelClass}>Returned from</div><div>{loc?.name ?? '—'}</div></div>
          <div className="col-span-2"><div className={labelClass}>Reason</div><div className="break-words">{doc.reason}</div></div>
          {doc.remarks && <div className="col-span-2 md:col-span-4"><div className={labelClass}>Remarks</div><div>{doc.remarks}</div></div>}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">Returned Materials</div>
          <div className="flex flex-col divide-y divide-slate-100">
            {doc.lines.map(l => {
              const v = variantById.get(l.materialVariantId);
              return (
                <div key={l._id} className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div className="col-span-2 md:col-span-1 font-medium">{variantLabel(v)}</div>
                  <div><span className="text-xs text-muted block">Qty</span>{q3(l.qty)} {v?.materialId?.baseUomId?.code ?? ''}</div>
                  <div><span className="text-xs text-muted block">Rate (landed)</span><RestrictedValue perm="purchases.rate.view">{inr(l.unitCost)}</RestrictedValue></div>
                  <div className="md:text-right"><span className="text-xs text-muted block">Amount</span><RestrictedValue perm="purchases.rate.view"><span className="font-semibold">{inr(l.amount)}</span></RestrictedValue></div>
                </div>
              );
            })}
          </div>
          <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex justify-between text-sm font-bold">
            <span>Debit Note Amount</span>
            <RestrictedValue perm="purchases.rate.view"><span>{inr(doc.totalAmount)}</span></RestrictedValue>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {doc.status === 'DRAFT' && (
            <Can perm="purchases.confirm">
              <button onClick={() => setShowConfirm('confirm')} disabled={saving} className="w-full sm:w-auto min-h-10 px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">Confirm Return (stock out)</button>
            </Can>
          )}
          {doc.status !== 'CANCELLED' && (
            <Can perm="purchases.cancel">
              <button onClick={() => setShowCancel(true)} disabled={saving} className="w-full sm:w-auto min-h-10 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-60">Cancel Return</button>
            </Can>
          )}
          <button onClick={() => navigate('/procurement/returns')} className="w-full sm:w-auto min-h-10 px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Back</button>
        </div>

        <ConfirmDialog
          open={showConfirm === 'confirm'}
          title="Confirm Purchase Return"
          impact={`Send ${doc.lines.map(l => `${q3(l.qty)} of ${variantLabel(variantById.get(l.materialVariantId))}`).join(', ')} back to ${supplierName(doc.supplierId)}? Stock is removed from ${loc?.name ?? 'the warehouse'} and a debit note of ${inr(doc.totalAmount)} is raised.`}
          confirmLabel="Confirm Return"
          isLoading={saving}
          onConfirm={confirmExisting}
          onCancel={() => setShowConfirm(null)}
        />
        <ConfirmDialog
          open={showCancel}
          title="Cancel Purchase Return"
          impact={
            <div className="flex flex-col gap-2">
              <span>{doc.status === 'CONFIRMED' ? 'The returned quantity will be put back into stock (ledger reversal) and the debit note voided.' : 'This draft will be cancelled.'}</span>
              <textarea className="input-field min-h-[70px]" placeholder="Reason (required)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            </div>
          }
          confirmLabel="Cancel Return"
          cancelLabel="Keep"
          danger
          isLoading={saving}
          confirmDisabled={!cancelReason.trim()}
          onConfirm={cancelExisting}
          onCancel={() => setShowCancel(false)}
        />
      </div>
    );
  }

  // ---------- new return ----------
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/procurement/returns')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">New Purchase Return</h1>
          <p className="text-muted">Send material back to the supplier from the lot it came in on.</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setReason(''); setRemarks(''); setQtys({}); if (!params.get('inwardId')) { setSupplierId(''); setInwardId(''); setLocationId(''); } }} />
      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
        <PickerField
          label="Supplier *"
          value={supplierId ? supplierName(supplierId) : undefined}
          placeholder="All suppliers — tap to choose"
          onOpen={() => setPicker('supplier')}
        />
        <PickerField
          label="Inward (GRN) *"
          value={inwards.find(i => i._id === inwardId)?.docNo}
          hint={(() => { const i = inwards.find(x => x._id === inwardId); return i ? `${formatDate(i.docDate)} · ${supplierName(i.supplierId)}` : undefined; })()}
          placeholder="Tap to choose inward"
          onOpen={() => setPicker('inward')}
        />
        <PickerField
          label="Return from"
          value={locations.find(l => l._id === locationId)?.name}
          placeholder={inwardId ? 'Tap to choose location' : 'Choose the inward first'}
          disabled={!inwardId}
          onOpen={() => setPicker('location')}
        />
        <div className="md:col-span-3">
          <label className={labelClass}>Reason *</label>
          <input className={inputClass} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Colour mismatch found at inspection, damaged in transit..." />
        </div>
        <div className="md:col-span-3">
          <label className={labelClass}>Remarks</label>
          <input className={inputClass} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="optional" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lots on this inward</div>
        {!inwardId ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Select an inward to see what can be returned.</div>
        ) : loadingLines ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : (returnable?.lines ?? []).length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-400 text-sm">Nothing to return on this inward.</div>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {returnable!.lines.map(l => {
              const v = variantById.get(l.materialVariantId);
              const uom = v?.materialId?.baseUomId?.code ?? '';
              const qty = Number(qtys[l.inwardLineId]) || 0;
              return (
                <div key={l.inwardLineId} className="p-3 md:px-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 break-words">{variantLabel(v)}</div>
                      <div className="text-xs font-mono text-slate-500">Lot {l.lotNo ?? '—'}</div>
                    </div>
                    <RestrictedValue perm="purchases.rate.view"><span className="text-xs text-slate-500 whitespace-nowrap">{inr(l.unitCost)} / {uom}</span></RestrictedValue>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="rounded bg-slate-50 p-2"><div className="text-muted">Received</div><div className="font-medium">{q3(l.received)}</div></div>
                    <div className="rounded bg-slate-50 p-2"><div className="text-muted">Returned</div><div className="font-medium">{q3(l.alreadyReturned)}</div></div>
                    <div className="rounded bg-slate-50 p-2"><div className="text-muted">On hand</div><div className="font-medium">{q3(l.onHand)}</div></div>
                    <div className="rounded bg-yellow-50 p-2"><div className="text-muted">Max</div><div className="font-semibold text-yellow-700">{q3(l.maxReturnQty)}</div></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 items-end">
                    <div>
                      <label className={labelClass}>Return qty ({uom})</label>
                      <input type="number" inputMode="decimal" min={0} step="0.001" max={l.maxReturnQty} className={inputClass}
                        value={qtys[l.inwardLineId] ?? ''} disabled={l.maxReturnQty <= 0}
                        onChange={e => setQtys(p => ({ ...p, [l.inwardLineId]: e.target.value }))} />
                    </div>
                    <div className="text-right text-sm">
                      <span className="text-xs text-muted block">Amount</span>
                      <RestrictedValue perm="purchases.rate.view"><span className="font-semibold">{inr(qty * l.unitCost)}</span></RestrictedValue>
                    </div>
                  </div>
                  {qty > l.maxReturnQty + 0.0005 && <p className="text-xs text-red-600">More than can be returned from this lot ({q3(l.maxReturnQty)} {uom}).</p>}
                </div>
              );
            })}
            <div className="flex items-center justify-between px-4 py-3 text-sm bg-slate-50">
              <span className="font-bold text-slate-700">Debit Note Amount</span>
              <RestrictedValue perm="purchases.rate.view"><span className="font-bold text-slate-900">{inr(total)}</span></RestrictedValue>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Can perm="purchases.confirm">
          <button onClick={() => { const e = validate(); if (e) setError(e); else { setError(''); setShowConfirm('confirm'); } }} disabled={saving}
            className="w-full sm:w-auto min-h-10 px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Confirm Return'}
          </button>
        </Can>
        <button onClick={() => { const e = validate(); if (e) setError(e); else { setError(''); setShowConfirm('draft'); } }} disabled={saving}
          className="w-full sm:w-auto min-h-10 px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm disabled:opacity-60">Save as Draft</button>
        <button onClick={() => navigate('/procurement/returns')} className="w-full sm:w-auto min-h-10 px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
      </div>

      <PickerSheet
        open={picker === 'supplier'}
        title="Choose supplier"
        items={[
          { id: '', title: 'All suppliers', subtitle: 'Show inwards from every supplier' },
          ...suppliers.map((s): PickerItem => ({ id: s._id, title: s.name, subtitle: [s.contactPerson, s.mobile, s.gstin].filter(Boolean).join(' · '), keywords: `${s.mobile ?? ''} ${s.gstin ?? ''}` })),
        ]}
        selectedId={supplierId}
        searchPlaceholder="Search supplier, mobile or GSTIN…"
        onSelect={it => { if (it.id !== supplierId) { setSupplierId(it.id); setInwardId(''); setQtys({}); } setPicker(null); }}
        onClose={() => setPicker(null)}
        createLabel="supplier"
        onCreate={q => { setPicker(null); setQuickAdd({ kind: 'supplier', name: q }); }}
      />
      <PickerSheet
        open={picker === 'inward'}
        title="Choose inward (GRN)"
        items={supplierInwards.map((i): PickerItem => ({
          id: i._id,
          title: i.docNo,
          subtitle: [formatDate(i.docDate), supplierName(i.supplierId), i.supplierRef ? `Ref ${i.supplierRef}` : '', i.lines?.length ? `${i.lines.length} line${i.lines.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
          keywords: i.supplierRef,
        }))}
        selectedId={inwardId}
        searchPlaceholder="Search GRN no., supplier or bill no…"
        emptyText={supplierId ? 'No confirmed inward from this supplier.' : 'No confirmed inward yet.'}
        onSelect={it => {
          const inw = inwards.find(i => i._id === it.id);
          setInwardId(it.id); setQtys({}); setLocationId('');
          if (inw) setSupplierId(inw.supplierId);
          setPicker(null);
        }}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        open={picker === 'location'}
        title="Return from"
        items={locations.map((l): PickerItem => ({ id: l._id, title: l.name, subtitle: l.code, keywords: l.code }))}
        selectedId={locationId}
        searchPlaceholder="Search warehouse…"
        onSelect={it => { setLocationId(it.id); setQtys({}); setPicker(null); }}
        onClose={() => setPicker(null)}
        createLabel="warehouse"
        onCreate={q => { setPicker(null); setQuickAdd({ kind: 'location', name: q }); }}
      />
      <QuickAddSupplierSheet
        open={quickAdd?.kind === 'supplier'}
        initialName={quickAdd?.name}
        onClose={() => setQuickAdd(null)}
        onCreated={s => { setSuppliers(prev => [...prev, s].sort((a, b) => a.name.localeCompare(b.name))); setSupplierId(s._id); setInwardId(''); setQtys({}); setQuickAdd(null); }}
      />
      <QuickAddMasterSheet
        open={quickAdd?.kind === 'location'}
        noun="warehouse"
        endpoint="/locations"
        withCode
        extraBody={{ kind: 'WAREHOUSE' }}
        initialName={quickAdd?.name}
        onClose={() => setQuickAdd(null)}
        onCreated={r => {
          setLocations(prev => [...prev, { _id: r._id, name: r.name, code: r.code ?? '', kind: 'WAREHOUSE', isActive: true }]);
          setLocationId(r._id); setQtys({}); setQuickAdd(null);
        }}
      />

      <ConfirmDialog
        open={showConfirm !== null}

        title={showConfirm === 'confirm' ? 'Confirm Purchase Return' : 'Save Draft Return'}
        impact={showConfirm === 'confirm'
          ? `Send ${chosen.map(l => `${q3(l.qty)} of lot ${l.lotNo}`).join(', ')} back to ${supplierName(supplierId || returnable?.supplierId)}? Stock is removed now and a debit note of ${inr(total)} is raised.`
          : 'Save this return as a draft? No stock moves until it is confirmed.'}
        confirmLabel={showConfirm === 'confirm' ? 'Confirm Return' : 'Save Draft'}
        isLoading={saving}
        onConfirm={() => submit(showConfirm === 'confirm')}
        onCancel={() => setShowConfirm(null)}
      />
    </div>
  );
}
