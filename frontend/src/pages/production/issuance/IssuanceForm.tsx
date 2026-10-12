import { useState, useEffect, useMemo, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft, Box, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import {
  designsApi, jobSlipsApi, jobWorkersApi, lookupsApi, materialIssuesApi, toProblem, fmtQty,
  type MaterialOption, type StockShortage, type JobSlipRecord,
} from '../../../lib/api/production';
import { STAGGER_CHILDREN } from '../../pageKit';

interface IssuanceItem {
  key: string;
  materialVariantId: string;
  materialName: string;
  bomRole?: string;
  requiredQty: number;
  previouslyIssued: number;
  onHand: number;
  issuingQty: number;
  uom: string;
  inBom: boolean;
}

export function IssuanceForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // Job Slip ID

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [shortages, setShortages] = useState<StockShortage[]>([]);
  const [notes, setNotes] = useState('');

  const [slip, setSlip] = useState<JobSlipRecord | null>(null);
  const [header, setHeader] = useState({ slipNumber: '', factoryName: '', designSku: '' });
  const [items, setItems] = useState<IssuanceItem[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [pickFor, setPickFor] = useState<string | null>(null);

  // Quantities typed in are kept on this device if the page is left (or the internet drops).
  const draftValue = useMemo(() => ({ notes, items }), [notes, items]);
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (!isLoading && slip && baseline.current === null) baseline.current = JSON.stringify(draftValue);
  }, [isLoading, slip, draftValue]);
  const draft = useDraft(`material-issue:${id ?? ''}`, draftValue, d => {
    setNotes(d.notes ?? '');
    setItems(prev => {
      const saved = new Map(d.items.map(i => [i.key, i]));
      const kept = prev.map(i => (saved.has(i.key) ? { ...i, issuingQty: saved.get(i.key)!.issuingQty } : i));
      const extras = d.items.filter(i => !prev.some(p => p.key === i.key));
      return [...kept, ...extras];
    });
  }, { enabled: !isLoading && !!slip, isEmpty: v => JSON.stringify(v) === baseline.current });

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await jobSlipsApi.get(id);
        setSlip(s);
        const [plan, worker, design, mats] = await Promise.all([
          jobSlipsApi.issuePlan(id),
          jobWorkersApi.get(String(s.jobWorkerId)).catch(() => null),
          designsApi.get(String(s.designId)).catch(() => null),
          lookupsApi.materialOptions().catch(() => []),
        ]);
        setMaterials(mats);
        setHeader({
          slipNumber: s.docNo,
          factoryName: worker?.name ?? '—',
          designSku: design ? design.designNo : '—',
        });
        setItems(plan.lines.map(l => ({
          key: l.materialVariantId,
          materialVariantId: l.materialVariantId,
          materialName: l.materialName,
          bomRole: l.roles[0],
          requiredQty: l.requiredQty,
          previouslyIssued: l.issuedQty,
          onHand: l.mainWhOnHand,
          issuingQty: Math.max(0, Math.min(l.pendingQty, l.mainWhOnHand)),
          uom: l.uom,
          inBom: l.inBom,
        })));
      } catch (err) {
        setError(toProblem(err, 'Could not load this job slip.').detail);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [id]);

  const updateItem = (key: string, patch: Partial<IssuanceItem>) => {
    setItems(prev => prev.map(item => (item.key === key ? { ...item, ...patch } : item)));
  };

  const addExtra = () => {
    setItems(prev => [...prev, { key: `x-${Date.now()}`, materialVariantId: '', materialName: '', requiredQty: 0, previouslyIssued: 0, onHand: 0, issuingQty: 0, uom: '', inBom: false }]);
  };

  const pickExtra = (key: string, variantId: string) => {
    const m = materials.find(x => x.materialVariantId === variantId);
    updateItem(key, { materialVariantId: variantId, materialName: m?.name ?? '', uom: m?.uom ?? '', onHand: m?.mainWhOnHand ?? 0 });
  };

  const toIssue = items.filter(i => i.materialVariantId && i.issuingQty > 0);
  const overStock = toIssue.filter(i => i.issuingQty > i.onHand + 0.0005);
  const canIssue = slip && ['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY'].includes(slip.status);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(''); setShortages([]);
    if (toIssue.length === 0) { setError('Enter a quantity to issue for at least one material.'); return; }
    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    if (!id) return;
    setShowConfirm(false);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Issuing moves stock and the server must check it is there - so this one waits for the internet.
      setError('No internet. Issuing material needs the server to check stock — your quantities are kept on this device. Tap Confirm again when you are back online.');
      return;
    }
    setIsSaving(true);
    let draftId: string | undefined;
    try {
      const draft = await materialIssuesApi.create({
        jobSlipId: id,
        lines: toIssue.map(i => ({ materialVariantId: i.materialVariantId, bomRole: i.bomRole, qtyBase: i.issuingQty })),
        notes: notes || undefined,
      });
      draftId = draft._id;
      await materialIssuesApi.confirm(draft._id);
      clearDraft();
      navigate(`/production/job-slips/${id}`);
    } catch (err) {
      const p = toProblem(err, 'Could not issue the material.');
      // Never leave a stray draft behind when the confirm itself was refused.
      if (draftId) await materialIssuesApi.cancel(draftId, `Auto-cancelled: confirm refused (${p.code ?? 'error'})`).catch(() => undefined);
      setError(p.detail);
      setShortages(p.shortages ?? []);
    } finally {
      setIsSaving(false);
    }
  };

  const clearDraft = () => draft.clear();
  const issuanceSummary = toIssue.map(item => `${fmtQty(item.issuingQty)} ${item.uom} of ${item.materialName}`).join(', ');

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const qtyInput = (item: IssuanceItem) => (
    <div className="flex items-center gap-2">
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.001"
        className={`input-field w-full text-right ${item.issuingQty > item.onHand + 0.0005 ? 'border-red-400' : ''}`}
        value={item.issuingQty === 0 ? '' : item.issuingQty}
        onChange={(e) => updateItem(item.key, { issuingQty: parseFloat(e.target.value) || 0 })}
      />
      <span className="text-muted text-sm w-6">{item.uom}</span>
    </div>
  );

  const materialCell = (item: IssuanceItem) => item.inBom || item.previouslyIssued > 0 ? (
    <div>
      <div className="font-medium">{item.materialName}</div>
      {item.bomRole && <div className="text-xs text-muted">{item.bomRole}</div>}
    </div>
  ) : (
    <PickerField
      value={item.materialName || undefined}
      hint={item.materialVariantId ? `${item.uom} · stock ${fmtQty(item.onHand)}` : undefined}
      placeholder="Tap to choose extra material"
      onOpen={() => setPickFor(item.key)}
    />
  );

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3 md:gap-4">
        <button onClick={() => navigate('/production/issuance')} className="icon-btn shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Issue Materials</h1>
          <p className="text-muted">Issuing materials for {header.slipNumber} to {header.factoryName}</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); if (baseline.current) { const b = JSON.parse(baseline.current) as typeof draftValue; setNotes(b.notes); setItems(b.items); } }} />
      {slip && !canIssue && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">This job slip is {slip.status.toLowerCase().replace('_', ' ')} — material can no longer be issued to it.</div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-4 bg-slate-50">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider block mb-1">Job Slip</span>
            <span className="text-lg font-bold text-slate-800">{header.slipNumber}</span>
          </Card>
          <Card className="p-4 bg-slate-50">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider block mb-1">Factory / Artisan</span>
            <span className="text-lg font-bold text-slate-800">{header.factoryName}</span>
          </Card>
          <Card className="p-4 bg-slate-50">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider block mb-1">Design</span>
            <span className="text-lg font-bold text-slate-800 truncate block">{header.designSku}</span>
          </Card>
        </div>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center border-b border-[var(--color-border)] pb-2 mb-2">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Box size={20} className="text-primary" /> Materials to Issue
            </h3>
            <Button type="button" variant="outline" onClick={addExtra} className="w-full sm:w-auto"><Plus size={16} /> Extra Material</Button>
          </div>
          {items.length === 0 && <div className="py-6 text-center text-muted">This design has no BOM. Add the material you are sending with "Extra Material".</div>}

          <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
            {items.map((item) => {
              const pending = Math.max(0, item.requiredQty - item.previouslyIssued);
              return (
                <div key={item.key} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                  <div className="flex justify-between gap-2">
                    <div className="flex-1 min-w-0">{materialCell(item)}</div>
                    {!item.inBom && item.previouslyIssued === 0 && (
                      <button type="button" className="icon-btn text-red-500" onClick={() => setItems(p => p.filter(i => i.key !== item.key))} aria-label="Remove"><Trash2 size={18} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-xs font-medium text-muted">Total Required</div><div className="text-muted">{fmtQty(item.requiredQty)} {item.uom}</div></div>
                    <div><div className="text-xs font-medium text-muted">Prev. Issued</div><div className="text-muted">{fmtQty(item.previouslyIssued)} {item.uom}</div></div>
                    <div><div className="text-xs font-medium text-muted">Pending</div><div className="font-semibold text-orange-600">{fmtQty(pending)} {item.uom}</div></div>
                    <div><div className="text-xs font-medium text-muted">In Warehouse</div><div className={item.onHand <= 0 ? 'text-red-600 font-semibold' : ''}>{fmtQty(item.onHand)} {item.uom}</div></div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">Issue Qty</label>
                    {qtyInput(item)}
                  </div>
                </div>
              );
            })}
          </div>

          {items.length > 0 && (
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                    <th className="p-3 text-sm font-semibold text-muted">Material</th>
                    <th className="p-3 text-sm font-semibold text-muted text-center">Total Required</th>
                    <th className="p-3 text-sm font-semibold text-muted text-center">Prev. Issued</th>
                    <th className="p-3 text-sm font-semibold text-muted text-center">Pending</th>
                    <th className="p-3 text-sm font-semibold text-muted text-center">In Warehouse</th>
                    <th className="p-3 text-sm font-semibold text-muted w-[200px]">Issue Qty</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const pending = Math.max(0, item.requiredQty - item.previouslyIssued);
                    return (
                      <tr key={item.key} className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-background)]">
                        <td className="p-3 min-w-[220px]">{materialCell(item)}</td>
                        <td className="p-3 text-center text-muted">{fmtQty(item.requiredQty)} {item.uom}</td>
                        <td className="p-3 text-center text-muted">{fmtQty(item.previouslyIssued)} {item.uom}</td>
                        <td className="p-3 text-center font-semibold text-orange-600">{fmtQty(pending)} {item.uom}</td>
                        <td className={`p-3 text-center ${item.onHand <= 0 ? 'text-red-600 font-semibold' : 'text-muted'}`}>{fmtQty(item.onHand)} {item.uom}</td>
                        <td className="p-3">{qtyInput(item)}</td>
                        <td className="p-3">
                          {!item.inBom && item.previouslyIssued === 0 && (
                            <button type="button" className="icon-btn text-red-500" onClick={() => setItems(p => p.filter(i => i.key !== item.key))} aria-label="Remove"><Trash2 size={18} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {overStock.length > 0 && (
            <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              More than the warehouse holds: {overStock.map(i => `${i.materialName} (${fmtQty(i.onHand)} ${i.uom} on hand)`).join(', ')}. The issue will be refused.
            </div>
          )}

          <div className="input-group">
            <label className="input-label">Notes</label>
            <input className="input-field" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional (e.g. vehicle no., handed to)" />
          </div>
        </Card>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex flex-col gap-2">
            <div className="flex items-start gap-2 font-medium"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>
            {shortages.length > 0 && (
              <ul className="pl-6 list-disc">
                {shortages.map(s => (
                  <li key={s.materialVariantId}><b>{s.name}</b>: issuing {fmtQty(s.required)} {s.uom}, available {fmtQty(s.available)} {s.uom}{s.shortBy !== undefined && <> — short by <b>{fmtQty(s.shortBy)} {s.uom}</b></>}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 z-10 bg-[var(--color-background)]/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6">
          <Button type="button" variant="secondary" onClick={() => navigate('/production/issuance')} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" isLoading={isSaving} disabled={!canIssue} className="w-full sm:w-auto">Confirm Material Issuance</Button>
        </div>
      </form>

      <PickerSheet
        open={pickFor !== null}
        title="Choose extra material"
        items={materials.map((m): PickerItem => ({ id: m.materialVariantId, title: m.name, subtitle: m.uom ? `Unit ${m.uom}` : undefined, meta: `${fmtQty(m.mainWhOnHand)} ${m.uom ?? ''}`.trim() }))}
        selectedId={items.find(i => i.key === pickFor)?.materialVariantId}
        searchPlaceholder="Search material or colour…"
        emptyText="No material found in the main warehouse."
        onSelect={it => { if (pickFor) pickExtra(pickFor, it.id); setPickFor(null); }}
        onClose={() => setPickFor(null)}
      />

      <ConfirmDialog
        open={showConfirm}

        title="Confirm Material Issuance"
        impact={`Issue ${issuanceSummary || 'the entered quantities'} from the main warehouse to ${header.factoryName}'s custody? Stock moves immediately.`}
        confirmLabel="Confirm Issuance"
        isLoading={isSaving}
        onConfirm={confirmSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
