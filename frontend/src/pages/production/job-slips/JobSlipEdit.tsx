import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { PickerSheet, PickerField } from '../../../components/forms/PickerSheet';
import { QuickAddDesignSheet } from '../../../components/forms/QuickAddDesignSheet';
import { designsApi, jobSlipsApi, toProblem, CHARGE_BASIS_LABEL, type ChargeBasis, type DesignRecord, type JobSlipRecord } from '../../../lib/api/production';
import { JobSlipForm } from './JobSlipForm';

const toInput = (d?: string) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const LOCKED = ['RECEIVED', 'CLOSED', 'CANCELLED'];

/** Edit route: material-based / processing slips get this header editor; design-based slips keep the old form. */
export function JobSlipEditSwitch() {
  const { id } = useParams<{ id: string }>();
  const [kind, setKind] = useState<'new' | 'old' | null>(null);
  useEffect(() => {
    if (!id) return;
    jobSlipsApi.get(id)
      .then(s => setKind((s as unknown as { materialBased?: boolean }).materialBased ? 'new' : 'old'))
      .catch(() => setKind('old'));
  }, [id]);
  if (!id || !kind) return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  return kind === 'new' ? <JobSlipEdit id={id} /> : <JobSlipForm />;
}

/**
 * Edit a created job slip (making or processing): date, challan no., lot no., design, rate,
 * return-by date, instructions and remarks. The material already given is not changed here
 * (it is stock that has moved) - give more fabric via Material Issuance.
 */
function JobSlipEdit({ id }: { id: string }) {
  const navigate = useNavigate();
  const [slip, setSlip] = useState<JobSlipRecord | null>(null);
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [docDate, setDocDate] = useState('');
  const [challanNo, setChallanNo] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [designId, setDesignId] = useState('');
  const [rate, setRate] = useState('');
  const [chargeBasis, setChargeBasis] = useState<ChargeBasis>('PER_PIECE');
  const [returnBy, setReturnBy] = useState('');
  const [instructions, setInstructions] = useState('');
  const [remarks, setRemarks] = useState('');
  const [picker, setPicker] = useState(false);
  const [addDesign, setAddDesign] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([jobSlipsApi.get(id), designsApi.list().catch(() => [] as DesignRecord[])])
      .then(([s, d]) => {
        const x = s as JobSlipRecord & { challanNo?: string; lotNo?: string };
        setSlip(s);
        setDesigns(d.filter(v => v.isActive));
        setDocDate(toInput(s.docDate));
        setChallanNo(x.challanNo ?? '');
        setLotNo(x.lotNo ?? '');
        setDesignId(s.designId ?? '');
        setRate(s.agreedRate !== undefined && s.agreedRate !== null ? String(s.agreedRate) : '');
        setChargeBasis(s.chargeBasis);
        setReturnBy(toInput(s.expectedCompletionDate));
        setInstructions(s.instructions ?? '');
        setRemarks(s.remarks ?? '');
      })
      .catch(err => setError(toProblem(err, 'Could not load the job slip.').detail));
  }, [id]);

  if (!slip) {
    return error ? <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      : <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  const isProcessing = slip.jobType === 'PROCESSING';
  const locked = LOCKED.includes(slip.status);
  const rateLocked = !['CREATED', 'MATERIAL_ISSUED', 'IN_PROCESS', 'READY'].includes(slip.status);
  const design = designs.find(d => d._id === designId);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!lotNo.trim()) return setError('Lot number cannot be empty.');
    if (rate && !(Number(rate) >= 0)) return setError('Rate must be a number.');
    setSaving(true); setError('');
    try {
      await jobSlipsApi.update(id, {
        docDate: docDate || undefined,
        challanNo,
        lotNo: lotNo.trim(),
        ...(isProcessing ? {} : { designId }),
        ...(rateLocked ? {} : { agreedRate: Number(rate) || 0, chargeBasis }),
        expectedCompletionDate: returnBy || undefined,
        instructions,
        remarks,
      });
      navigate(`/production/job-slips/${id}`);
    } catch (err) {
      setError(toProblem(err, 'Could not save the changes.').detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/production/job-slips/${id}`)} className="icon-btn w-10 h-10" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">Edit {isProcessing ? 'Processing' : 'Job Slip'} · {lotNo || slip.docNo}</h1>
          <p className="text-muted text-sm">{slip.docNo}</p>
        </div>
      </div>

      {locked && <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">This slip is {slip.status.toLowerCase()} — it can no longer be edited.</p>}
      {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <form onSubmit={save} className="flex flex-col gap-5">
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Date</span>
              <input type="date" className="input-field" value={docDate} onChange={e => setDocDate(e.target.value)} disabled={locked} />
            </label>
            <Input label="Challan No." value={challanNo} onChange={e => setChallanNo(e.target.value)} disabled={locked} />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Lot No.</span>
              <input className="input-field uppercase" value={lotNo} onChange={e => setLotNo(e.target.value)} disabled={locked} />
            </label>
            {!isProcessing && (
              <PickerField
                label={<>Design <span className="text-muted font-normal">(optional)</span></>}
                value={design?.designNo}
                placeholder="Karigar’s own / tap to choose"
                onOpen={() => setPicker(true)}
                disabled={locked}
              />
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Rate (₹)</span>
                <RestrictedValue perm="jobslips.view">
                  <input type="number" inputMode="decimal" min="0" step="any" className="input-field text-right" value={rate} onChange={e => setRate(e.target.value)} disabled={locked || rateLocked} />
                </RestrictedValue>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Per</span>
                <select className="input-field" value={chargeBasis} onChange={e => setChargeBasis(e.target.value as ChargeBasis)} disabled={locked || rateLocked}>
                  {(Object.keys(CHARGE_BASIS_LABEL) as ChargeBasis[]).map(c => <option key={c} value={c}>{CHARGE_BASIS_LABEL[c]}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Return by</span>
              <input type="date" className="input-field" value={returnBy} onChange={e => setReturnBy(e.target.value)} disabled={locked} />
            </label>
          </div>
          {rateLocked && !locked && <p className="text-xs text-muted">Rate can’t change after goods have been received.</p>}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Instructions</span>
            <textarea className="input-field min-h-20" value={instructions} onChange={e => setInstructions(e.target.value)} disabled={locked} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Remarks</span>
            <textarea className="input-field min-h-16" value={remarks} onChange={e => setRemarks(e.target.value)} disabled={locked} />
          </label>
          <p className="text-xs text-muted">The fabric already given can’t be changed here — to give more, use Material Issuance for this slip.</p>
        </Card>

        {!locked && (
          <div className="grid grid-cols-[1fr_2fr] sm:flex sm:justify-end gap-3 sticky bottom-0 z-10 bg-[var(--color-background)]/95 backdrop-blur p-4 border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <Button type="button" variant="secondary" onClick={() => navigate(`/production/job-slips/${id}`)} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" isLoading={saving} className="w-full sm:w-auto">Save Changes</Button>
          </div>
        )}
      </form>

      <PickerSheet
        open={picker}
        title="Choose design (optional)"
        items={designs.map(d => ({ id: d._id, title: d.designNo, keywords: d.designNo }))}
        selectedId={designId}
        searchPlaceholder="Search design code…"
        onSelect={it => { setDesignId(it.id); setPicker(false); }}
        onClose={() => setPicker(false)}
        onCreate={q => { setPicker(false); setAddDesign(q); }}
        createLabel="design"
        footer={designId ? <Button type="button" variant="secondary" className="w-full" onClick={() => { setDesignId(''); setPicker(false); }}>No design — karigar’s own</Button> : undefined}
      />
      <QuickAddDesignSheet
        open={addDesign !== null}
        initialName={addDesign ?? ''}
        onClose={() => setAddDesign(null)}
        onCreated={d => { setDesigns(prev => [d, ...prev]); setDesignId(d._id); setAddDesign(null); }}
      />
    </div>
  );
}
