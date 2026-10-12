import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft, Calculator, AlertTriangle } from 'lucide-react';
import {
  designsApi, jobSlipsApi, jobWorkersApi, lookupsApi, productionOrdersApi, toProblem, fmtQty, toDateInput,
  JOB_SLIP_STATUS_LABEL, CHARGE_BASIS_LABEL,
  type DesignRecord, type JobWorkerLite, type NamedRecord, type RequirementResult, type StockShortage,
  type ChargeBasis, type JobSlipRecord,
} from '../../../lib/api/production';
import { STAGGER_CHILDREN } from '../../pageKit';

export function JobSlipForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [search] = useSearchParams();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [shortages, setShortages] = useState<StockShortage[]>([]);

  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [workers, setWorkers] = useState<JobWorkerLite[]>([]);
  const [colours, setColours] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [existing, setExisting] = useState<JobSlipRecord | null>(null);

  const [formData, setFormData] = useState({
    designId: '',
    jobWorkerId: '',
    productionOrderId: '',
    expectedCompletionDate: '',
    chargeBasis: 'PER_PIECE' as ChargeBasis,
    agreedRate: '',
    instructions: '',
    remarks: '',
  });
  const [qty, setQty] = useState<Record<string, string>>({}); // colourId|sizeId -> pcs
  const [req, setReq] = useState<RequirementResult | null>(null);
  const [reqError, setReqError] = useState('');

  useEffect(() => {
    const poId = search.get('productionOrderId');
    const loads: Promise<unknown>[] = [
      designsApi.list().then(setDesigns),
      jobWorkersApi.list().then(setWorkers),
      lookupsApi.colours().then(setColours),
      lookupsApi.sizes().then(setSizes),
    ];
    if (isEditing && id) {
      loads.push(jobSlipsApi.get(id).then(s => {
        setExisting(s);
        setFormData({
          designId: String(s.designId),
          jobWorkerId: String(s.jobWorkerId),
          productionOrderId: s.productionOrderId ? String(s.productionOrderId) : '',
          expectedCompletionDate: toDateInput(s.expectedCompletionDate),
          chargeBasis: s.chargeBasis,
          agreedRate: String(s.agreedRate),
          instructions: s.instructions ?? '',
          remarks: s.remarks ?? '',
        });
        const q: Record<string, string> = {};
        for (const l of s.expectedOutputLines) if (l.colourId && l.sizeId) q[`${l.colourId}|${l.sizeId}`] = String(l.expectedQty);
        setQty(q);
      }));
    } else if (poId) {
      loads.push(productionOrdersApi.get(poId).then(po => {
        setFormData(f => ({ ...f, designId: String(po.designId), productionOrderId: po._id }));
        const q: Record<string, string> = {};
        for (const l of po.quantities) q[`${l.colourId}|${l.sizeId}`] = String(l.qty);
        setQty(q);
      }));
    }
    Promise.all(loads)
      .catch(err => setLoadError(toProblem(err, 'Could not load the job slip form.').detail))
      .finally(() => setIsLoading(false));
  }, [isEditing, id, search]);

  const design = designs.find(d => d._id === formData.designId);
  const cName = (cid: string) => colours.find(c => c._id === String(cid))?.name ?? '?';
  const sName = (sid: string) => sizes.find(s => s._id === String(sid))?.name ?? '?';
  const total = Object.values(qty).reduce((s, v) => s + (parseInt(v) || 0), 0);

  // Prefill instructions from the design the first time one is picked.
  useEffect(() => {
    if (!isEditing && design?.manufacturingInstructions) {
      setFormData(f => (f.instructions ? f : { ...f, instructions: design.manufacturingInstructions ?? '' }));
    }
  }, [design, isEditing]);

  useEffect(() => {
    if (!formData.designId || total <= 0) { setReq(null); setReqError(''); return; }
    const t = setTimeout(() => {
      designsApi.requirements(formData.designId, total)
        .then(r => { setReq(r); setReqError(''); })
        .catch(err => { setReq(null); setReqError(toProblem(err).detail); });
    }, 300);
    return () => clearTimeout(t);
  }, [formData.designId, total]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError('');
    setShortages([]);
    if (!formData.jobWorkerId) { setSaveError('Select a factory or karigar.'); return; }
    const rate = Number(formData.agreedRate);
    if (!(rate >= 0) || formData.agreedRate === '') { setSaveError('Enter the agreed rate.'); return; }
    setIsSaving(true);
    try {
      if (isEditing && id && existing) {
        await jobSlipsApi.update(id, {
          jobWorkerId: formData.jobWorkerId !== String(existing.jobWorkerId) ? formData.jobWorkerId : undefined,
          expectedCompletionDate: formData.expectedCompletionDate || undefined,
          chargeBasis: formData.chargeBasis,
          agreedRate: rate,
          instructions: formData.instructions,
          remarks: formData.remarks,
        });
        navigate(`/production/job-slips/${id}`);
      } else {
        if (!formData.designId) { setSaveError('Select a design.'); setIsSaving(false); return; }
        const lines = Object.entries(qty)
          .map(([k, v]) => ({ colourId: k.split('|')[0], sizeId: k.split('|')[1], expectedQty: parseInt(v) || 0 }))
          .filter(l => l.expectedQty > 0);
        if (lines.length === 0) { setSaveError('Enter the batch quantity for at least one colour/size.'); setIsSaving(false); return; }
        const created = await jobSlipsApi.create({
          jobType: 'MANUFACTURING',
          jobWorkerId: formData.jobWorkerId,
          designId: formData.designId,
          productionOrderId: formData.productionOrderId || undefined,
          expectedOutputLines: lines,
          expectedCompletionDate: formData.expectedCompletionDate || undefined,
          chargeBasis: formData.chargeBasis,
          agreedRate: rate,
          instructions: formData.instructions || undefined,
          remarks: formData.remarks || undefined,
        });
        navigate(`/production/job-slips/${created._id}`);
      }
    } catch (err) {
      const p = toProblem(err, 'Could not save the job slip.');
      if (p.code === 'INSUFFICIENT_STOCK') {
        setSaveError('Not enough raw material in the main warehouse to create this job slip. Inward the material first, or reduce the batch.');
        setShortages(p.shortages ?? []);
        if (!p.shortages?.length) setSaveError(p.detail);
      } else {
        setSaveError(p.detail);
      }
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const lockedQty = isEditing;
  const status = existing ? JOB_SLIP_STATUS_LABEL[existing.status] : 'Created';

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3 md:gap-4">
        <button onClick={() => navigate(isEditing ? `/production/job-slips/${id}` : '/production/job-slips')} className="icon-btn shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? `Edit Job Slip ${existing?.docNo ?? ''}` : 'Create Job Slip'}</h1>
          <p className="text-muted">Issue a manufacturing batch to a factory or karigar.</p>
        </div>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2 mb-2">Order Details</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label">Design *</label>
              <select name="designId" value={formData.designId} onChange={e => { handleChange(e); setQty({}); }} className="input-field" required disabled={isEditing || Boolean(formData.productionOrderId)}>
                <option value="">Select Design...</option>
                {designs.filter(d => d.isActive || d._id === formData.designId).map(d => (
                  <option key={d._id} value={d._id}>{d.designNo} - {d.name}</option>
                ))}
              </select>
              {formData.productionOrderId && !isEditing && <p className="text-xs text-muted mt-1">From a production requirement.</p>}
            </div>

            <div className="input-group">
              <label className="input-label">Factory / Karigar *</label>
              <select name="jobWorkerId" value={formData.jobWorkerId} onChange={handleChange} className="input-field" required disabled={isEditing && existing?.status !== 'CREATED'}>
                <option value="">Select...</option>
                {workers.filter(w => w.isActive || w._id === formData.jobWorkerId).map(w => (
                  <option key={w._id} value={w._id}>
                    {w.name}{w.contactPerson ? ` — ${w.contactPerson}` : ''} ({w.type === 'FACTORY' ? 'Factory' : 'Karigar'}{w.specialty ? `, ${w.specialty}` : ''})
                  </option>
                ))}
              </select>
              {isEditing && existing?.status !== 'CREATED' && <p className="text-xs text-muted mt-1">Party is fixed once material has been issued.</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="input-group">
              <label className="input-label">Charge Basis *</label>
              <select name="chargeBasis" value={formData.chargeBasis} onChange={handleChange} className="input-field">
                {(Object.keys(CHARGE_BASIS_LABEL) as ChargeBasis[]).map(b => <option key={b} value={b}>{CHARGE_BASIS_LABEL[b]}</option>)}
              </select>
            </div>
            <Input label={`Agreed Rate (₹${formData.chargeBasis === 'PER_PIECE' ? ' / pc' : formData.chargeBasis === 'PER_METER' ? ' / m' : ''})`} name="agreedRate" type="number" inputMode="decimal" min="0" step="0.01" value={formData.agreedRate} onChange={handleChange} required />
            <Input label="Target Completion Date" name="expectedCompletionDate" type="date" value={formData.expectedCompletionDate} onChange={handleChange} />
          </div>

          <div className="input-group">
            <label className="input-label">Status</label>
            <input className="input-field" value={status} disabled />
            {!isEditing && <p className="text-xs text-muted mt-1">New job slips start as "Created"; status then advances automatically (JOB-03).</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="input-group">
              <label className="input-label">Instructions</label>
              <textarea name="instructions" value={formData.instructions} onChange={handleChange} className="input-field min-h-[70px] resize-y" />
            </div>
            <div className="input-group">
              <label className="input-label">Remarks</label>
              <textarea name="remarks" value={formData.remarks} onChange={handleChange} className="input-field min-h-[70px] resize-y" />
            </div>
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Batch Quantity (pcs) by Colour & Size</h3>
          {lockedQty && <p className="text-xs text-muted -mt-2">Quantities are fixed once a slip is saved (they drive the stock check). Cancel and re-create the slip to change them.</p>}
          {!design ? (
            <div className="py-6 text-center text-muted bg-slate-50 rounded-md border border-dashed">Select a design first.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {design.colourOptions.map(cid => (
                <div key={String(cid)} className="border border-slate-200 rounded-lg p-3">
                  <div className="text-sm font-medium text-slate-800 mb-2">{cName(String(cid))}</div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {design.sizeOptions.map(sid => {
                      const key = `${cid}|${sid}`;
                      return (
                        <label key={key} className="flex flex-col gap-1 text-xs text-slate-500">
                          {sName(String(sid))}
                          <input type="number" inputMode="numeric" min="0" disabled={lockedQty} className="input-field w-full" value={qty[key] ?? ''} onChange={e => setQty(q => ({ ...q, [key]: e.target.value }))} />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="text-sm text-slate-600">Total: <b>{total.toLocaleString('en-IN')}</b> pcs</div>
            </div>
          )}
        </Card>

        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
            <Calculator size={20} className="text-primary" /> Material Requirement
          </h3>
          {!design || total <= 0 ? (
            <div className="py-8 text-center text-muted bg-slate-50 rounded-md border border-dashed">
              Select a design and enter quantities to see raw material requirements.
            </div>
          ) : reqError ? (
            <div className="p-4 text-center text-muted">{reqError.includes('no active BOM') ? 'This design has no BOM yet — no stock check will be applied.' : reqError}</div>
          ) : req ? (
            <div>
              <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
                {req.byMaterial.map(m => (
                  <div key={m.materialVariantId} className={`flex flex-col gap-2 p-3 border rounded-lg ${m.shortfall > 0 ? 'border-red-200 bg-red-50' : 'border-[var(--color-border)] bg-[var(--color-background)]'}`}>
                    <span className="font-medium">{m.materialName}</span>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div><div className="text-xs text-muted">Required</div><div className="font-bold text-[#B80037]">{fmtQty(m.requiredQtyBase)} {m.uom}</div></div>
                      <div><div className="text-xs text-muted">In warehouse</div><div>{fmtQty(m.availableQtyBase)} {m.uom}</div></div>
                      <div><div className="text-xs text-muted">Short</div><div className={m.shortfall > 0 ? 'font-semibold text-red-600' : 'text-green-700'}>{m.shortfall > 0 ? `${fmtQty(m.shortfall)} ${m.uom}` : 'OK'}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                      <th className="p-3 text-sm font-semibold text-muted">Raw Material</th>
                      <th className="p-3 text-sm font-semibold text-muted text-center">Required (incl. allowance)</th>
                      <th className="p-3 text-sm font-semibold text-muted text-center">In Main Warehouse</th>
                      <th className="p-3 text-sm font-semibold text-muted text-center">Shortfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {req.byMaterial.map(m => (
                      <tr key={m.materialVariantId} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="p-3 font-medium">{m.materialName}</td>
                        <td className="p-3 text-center font-bold text-[#B80037]">{fmtQty(m.requiredQtyBase)} {m.uom}</td>
                        <td className="p-3 text-center">{fmtQty(m.availableQtyBase)} {m.uom}</td>
                        <td className={`p-3 text-center ${m.shortfall > 0 ? 'font-semibold text-red-600' : 'text-green-700'}`}>{m.shortfall > 0 ? `${fmtQty(m.shortfall)} ${m.uom}` : 'OK'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-muted">
                Garments × qty per garment × (1 + allowance%). The slip can be saved when the main warehouse holds at least the BOM quantity (before allowance) not already reserved by other open job slips.
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-muted">Calculating…</div>
          )}
        </Card>

        {saveError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex flex-col gap-2">
            <div className="flex items-start gap-2 font-medium"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {saveError}</div>
            {shortages.length > 0 && (
              <ul className="flex flex-col gap-1 pl-6 list-disc">
                {shortages.map(s => (
                  <li key={s.materialVariantId}>
                    <b>{s.name}</b>: required {fmtQty(s.required)} {s.uom}, available {fmtQty(s.available)} {s.uom}
                    {s.shortBy !== undefined && <> — short by <b>{fmtQty(s.shortBy)} {s.uom}</b></>}
                    {s.reservedByOpenJobSlips ? <span className="text-red-500"> ({fmtQty(s.reservedByOpenJobSlips)} {s.uom} reserved by other open job slips)</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 z-10 bg-[var(--color-background)]/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6">
          <Button type="button" variant="secondary" onClick={() => navigate(isEditing ? `/production/job-slips/${id}` : '/production/job-slips')} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} className="w-full sm:w-auto">
            Save Job Slip
          </Button>
        </div>
      </form>
    </div>
  );
}
