import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FlaskConical, AlertTriangle, CheckCircle, FileText, Scale } from 'lucide-react';
import { Can, RestrictedValue } from '../../../lib/permissions/Can';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { formatINR } from '../../../lib/format/money';
import {
  designsApi, jobWorkersApi, lookupsApi, toProblem, fmtDate, fmtQty, JOB_SLIP_STATUS_LABEL, CHARGE_BASIS_LABEL,
  type ApiProblem, type ChargeBasis, type DesignRecord, type MaterialOption,
} from '../../../lib/api/production';
import { processingJobsApi, challanUrl, type ProcessingJobRow } from '../../../lib/api/jobwork';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { QuickAddMasterSheet } from '../../../components/forms/QuickAddMasterSheet';
import { QuickAddJobWorkerSheet } from '../../../components/forms/QuickAddJobWorkerSheet';
import { QuickAddDesignSheet } from '../../../components/forms/QuickAddDesignSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

const EMPTY_PROCESSING_JOB = {
  processingTypeId: '', jobWorkerId: '', designId: '', inputMaterialVariantId: '', inputQty: '',
  outputMaterialVariantId: '', expectedOutputQty: '', chargeBasis: 'PER_METER' as ChargeBasis, agreedRate: '',
  expectedCompletionDate: '', instructions: '',
};
type ProcPicker = 'ptype' | 'worker' | 'design' | 'input' | 'output';

const fieldCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]';

function ErrorBox({ problem }: { problem: ApiProblem | null }) {
  if (!problem) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
      <div>{problem.code && <div className="font-semibold text-xs uppercase">{problem.code.replace(/_/g, ' ')}</div>}{problem.detail}</div>
    </div>
  );
}

export function ProcessingJobForm() {
  const { id } = useParams<{ id: string }>();
  return id ? <ProcessingJobDetail id={id} /> : <ProcessingJobCreate />;
}

/* ------------------------------------------------------------------ */

function ProcessingJobCreate() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<{ _id: string; name: string; type?: string; mobile?: string; specialty?: string }[]>([]);
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [ptypes, setPtypes] = useState<{ _id: string; name: string }[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [askConfirm, setAskConfirm] = useState(false);
  const [form, setForm] = useState(EMPTY_PROCESSING_JOB);
  const [picker, setPicker] = useState<ProcPicker | null>(null);
  const [quickAdd, setQuickAdd] = useState<null | { kind: 'ptype' | 'worker' | 'design'; name: string }>(null);
  const [notice, setNotice] = useState('');
  const draft = useDraft('processing-job:new', form, setForm, {
    enabled: !loading,
    isEmpty: f => !f.processingTypeId && !f.jobWorkerId && !f.designId && !f.inputMaterialVariantId && !f.inputQty && !f.outputMaterialVariantId && !f.instructions.trim(),
  });
  const pick = (field: keyof typeof EMPTY_PROCESSING_JOB, value: string) => { setForm(f => ({ ...f, [field]: value })); setPicker(null); };

  useEffect(() => {
    Promise.all([jobWorkersApi.list(), designsApi.list(), processingJobsApi.processingTypes(), lookupsApi.materialOptions()])
      .then(([w, d, p, m]) => {
        setWorkers(w.filter(x => x.isActive !== false));
        setDesigns(d.filter(x => x.isActive));
        setPtypes(p.filter(x => x.isActive !== false));
        setMaterials(m.filter(x => x.isActive));
      })
      .catch(e => setProblem(toProblem(e)))
      .finally(() => setLoading(false));
  }, []);

  const set = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const input = materials.find(m => m.materialVariantId === form.inputMaterialVariantId);
  const output = materials.find(m => m.materialVariantId === form.outputMaterialVariantId);
  const overStock = input && Number(form.inputQty) > input.mainWhOnHand;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.jobWorkerId) return setProblem({ detail: 'Choose the factory / processor.' });
    if (!form.designId) return setProblem({ detail: 'Choose the design the processed fabric is for.' });
    if (!form.inputMaterialVariantId) return setProblem({ detail: 'Choose the material to send.' });
    if (!form.outputMaterialVariantId) return setProblem({ detail: 'Choose the processed (output) material.' });
    if (form.inputMaterialVariantId === form.outputMaterialVariantId) return setProblem({ detail: 'The processed (output) material must differ from the input material.' });
    if (overStock) return setProblem({ code: 'INSUFFICIENT_STOCK', detail: `Only ${fmtQty(input!.mainWhOnHand)} ${input!.uom} of ${input!.name} is in the warehouse.` });
    setProblem(null);
    setAskConfirm(true);
  };

  const save = async () => {
    setAskConfirm(false); setSaving(true); setProblem(null);
    try {
      const res = await submitOrQueue<ProcessingJobRow>({
        method: 'POST',
        url: '/processing-jobs',
        label: `Processing job · ${workers.find(w => w._id === form.jobWorkerId)?.name ?? ''} · ${fmtQty(Number(form.inputQty))} ${input?.uom ?? ''} ${input?.name ?? ''}`.replace(/\s+/g, ' ').trim(),
        body: {
          jobWorkerId: form.jobWorkerId, designId: form.designId, processingTypeId: form.processingTypeId || undefined,
          inputMaterialVariantId: form.inputMaterialVariantId, inputQty: Number(form.inputQty),
          outputMaterialVariantId: form.outputMaterialVariantId, expectedOutputQty: Number(form.expectedOutputQty),
          chargeBasis: form.chargeBasis, agreedRate: Number(form.agreedRate || 0),
          expectedCompletionDate: form.expectedCompletionDate || undefined, instructions: form.instructions || undefined,
        },
      });
      draft.clear();
      if (res.queued) {
        setNotice("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/production/processing'), 1800);
        return;
      }
      navigate(`/production/processing/${res.data.id}`);
    } catch (e) {
      setProblem(toProblem(e));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/processing')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Back"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">New Processing Job</h1>
          <p className="text-sm text-slate-500">Send material for dyeing, printing or other processing</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setForm(EMPTY_PROCESSING_JOB); }} />
      {notice && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{notice}</p>}
      <ErrorBox problem={problem} />

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2"><FlaskConical size={15} className="text-[#E40043]" /> Job Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PickerField
              label={<span className="text-slate-700">Process Type</span>}
              value={ptypes.find(p => p._id === form.processingTypeId)?.name}
              placeholder="Tap to choose process type"
              onOpen={() => setPicker('ptype')}
            />
            <PickerField
              label={<span className="text-slate-700">Factory / Processor <span className="text-red-500">*</span></span>}
              value={workers.find(w => w._id === form.jobWorkerId)?.name}
              hint={workers.find(w => w._id === form.jobWorkerId)?.mobile}
              placeholder="Tap to choose factory"
              onOpen={() => setPicker('worker')}
            />
            <PickerField
              className="sm:col-span-2"
              label={<span className="text-slate-700">For Design <span className="text-red-500">*</span></span>}
              value={(() => { const d = designs.find(x => x._id === form.designId); return d ? `${d.designNo} — ${d.name}` : undefined; })()}
              placeholder="Tap to choose the design the processed fabric is for"
              onOpen={() => setPicker('design')}
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expected Return Date</label>
              <input type="date" name="expectedCompletionDate" value={form.expectedCompletionDate} onChange={set} className={fieldCls} />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Input Material (sent)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <PickerField
                label={<span className="text-slate-700">Material <span className="text-red-500">*</span></span>}
                value={input?.name}
                hint={input ? `${fmtQty(input.mainWhOnHand)} ${input.uom} in stock` : undefined}
                placeholder="Tap to choose material to send"
                onOpen={() => setPicker('input')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity {input ? `(${input.uom})` : ''} <span className="text-red-500">*</span></label>
              <input type="number" inputMode="decimal" name="inputQty" value={form.inputQty} onChange={set} required min="0.001" step="0.001" placeholder="0.000" className={`${fieldCls} ${overStock ? 'border-red-400' : ''}`} />
              {overStock && <span className="text-xs text-red-500">Only {fmtQty(input!.mainWhOnHand)} in stock</span>}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Output / Processed Material</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <PickerField
                label={<span className="text-slate-700">Output Material <span className="text-red-500">*</span></span>}
                value={output?.name}
                placeholder="Tap to choose processed material"
                onOpen={() => setPicker('output')}
              />
              <span className="text-xs text-slate-400">Add it under Masters → Materials first if it is new (e.g. "Printed Dupatta - Blue").</span>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Expected Output Qty {output ? `(${output.uom})` : ''} <span className="text-red-500">*</span></label>
              <input type="number" inputMode="decimal" name="expectedOutputQty" value={form.expectedOutputQty} onChange={set} required min="0.001" step="0.001" placeholder="0.000" className={fieldCls} />
            </div>
          </div>
        </div>

        <RestrictedValue perm="receiving.rate.view">
          <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Processing Charges</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ChoiceChips
                label={<span className="text-slate-700">Charge Basis</span>}
                value={form.chargeBasis}
                options={(Object.keys(CHARGE_BASIS_LABEL) as ChargeBasis[]).map(b => ({ value: b, label: CHARGE_BASIS_LABEL[b] }))}
                onChange={b => setForm(f => ({ ...f, chargeBasis: b }))}
              />
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rate (₹ {form.chargeBasis === 'LUMP_SUM' ? 'total' : form.chargeBasis === 'PER_METER' ? '/ metre received' : '/ piece'})</label>
                <input type="number" inputMode="decimal" name="agreedRate" value={form.agreedRate} onChange={set} min="0" step="0.01" placeholder="0.00" className={fieldCls} />
              </div>
            </div>
            {form.agreedRate && form.expectedOutputQty && form.chargeBasis !== 'LUMP_SUM' && (
              <p className="text-xs text-slate-500 mt-2">Estimated charge: {formatINR(Number(form.agreedRate) * Number(form.expectedOutputQty))} (charged on quantity received)</p>
            )}
          </div>
        </RestrictedValue>

        <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700 mb-1">Instructions</label>
          <textarea name="instructions" value={form.instructions} onChange={set} rows={3} placeholder="Shade, print reference, finishing…" className={`${fieldCls} resize-none`} />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="submit" disabled={saving} className="w-full sm:w-auto min-h-10 px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
            {saving ? 'Saving…' : 'Create & Issue Material'}
          </button>
          <button type="button" onClick={() => navigate('/production/processing')} className="w-full sm:w-auto min-h-10 px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">Cancel</button>
        </div>
      </form>

      <PickerSheet
        open={picker === 'ptype'}
        title="Choose process type"
        items={[{ id: '', title: 'No process type' }, ...ptypes.map((p): PickerItem => ({ id: p._id, title: p.name }))]}
        selectedId={form.processingTypeId}
        searchPlaceholder="Search process (dyeing, printing…)"
        onSelect={it => pick('processingTypeId', it.id)}
        onClose={() => setPicker(null)}
        createLabel="process type"
        onCreate={q => { setPicker(null); setQuickAdd({ kind: 'ptype', name: q }); }}
      />
      <PickerSheet
        open={picker === 'worker'}
        title="Choose factory / processor"
        items={workers.map((w): PickerItem => ({ id: w._id, title: w.name, subtitle: [w.type === 'FACTORY' ? 'Factory' : w.type === 'ARTISAN' ? 'Karigar' : '', w.specialty, w.mobile].filter(Boolean).join(' · '), keywords: w.mobile }))}
        selectedId={form.jobWorkerId}
        searchPlaceholder="Search factory, dyer or mobile…"
        onSelect={it => pick('jobWorkerId', it.id)}
        onClose={() => setPicker(null)}
        createLabel="factory"
        onCreate={q => { setPicker(null); setQuickAdd({ kind: 'worker', name: q }); }}
      />
      <PickerSheet
        open={picker === 'design'}
        title="Choose design"
        items={designs.map((d): PickerItem => ({ id: d._id, title: d.designNo, keywords: d.designNo }))}
        selectedId={form.designId}
        searchPlaceholder="Search design no. or name…"
        onSelect={it => pick('designId', it.id)}
        onClose={() => setPicker(null)}
        createLabel="design"
        onCreate={q => { setPicker(null); setQuickAdd({ kind: 'design', name: q }); }}
      />
      <PickerSheet
        open={picker === 'input'}
        title="Material to send"
        items={materials.filter(m => m.mainWhOnHand > 0).map((m): PickerItem => ({ id: m.materialVariantId, title: m.name, subtitle: m.uom ? `Unit ${m.uom}` : undefined, meta: `${fmtQty(m.mainWhOnHand)} ${m.uom}` }))}
        selectedId={form.inputMaterialVariantId}
        searchPlaceholder="Search material or colour…"
        emptyText="No material in stock matches. Material enters stock through a purchase inward."
        onSelect={it => pick('inputMaterialVariantId', it.id)}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        open={picker === 'output'}
        title="Processed (output) material"
        items={materials.filter(m => m.materialVariantId !== form.inputMaterialVariantId).map((m): PickerItem => ({ id: m.materialVariantId, title: m.name, subtitle: m.uom ? `Unit ${m.uom}` : undefined, meta: `${fmtQty(m.mainWhOnHand)} ${m.uom}` }))}
        selectedId={form.outputMaterialVariantId}
        searchPlaceholder="Search material or colour…"
        emptyText='Not listed? Add it under Inventory → Materials with its colour first (e.g. "Printed Dupatta - Blue").'
        onSelect={it => pick('outputMaterialVariantId', it.id)}
        onClose={() => setPicker(null)}
      />
      <QuickAddMasterSheet
        open={quickAdd?.kind === 'ptype'}
        noun="process type"
        endpoint="/processing-types"
        initialName={quickAdd?.name}
        namePlaceholder="e.g. Dyeing, Printing"
        onClose={() => setQuickAdd(null)}
        onCreated={r => { setPtypes(prev => [...prev, { _id: r._id, name: r.name }]); setForm(f => ({ ...f, processingTypeId: r._id })); setQuickAdd(null); }}
      />
      <QuickAddJobWorkerSheet
        open={quickAdd?.kind === 'worker'}
        initialName={quickAdd?.name}
        defaultType="FACTORY"
        onClose={() => setQuickAdd(null)}
        onCreated={w => { setWorkers(prev => [...prev, w].sort((a, b) => a.name.localeCompare(b.name))); setForm(f => ({ ...f, jobWorkerId: w._id })); setQuickAdd(null); }}
      />
      <QuickAddDesignSheet
        open={quickAdd?.kind === 'design'}
        initialName={quickAdd?.name}
        onClose={() => setQuickAdd(null)}
        onCreated={d => { setDesigns(prev => [...prev, d]); setForm(f => ({ ...f, designId: d._id })); setQuickAdd(null); }}
      />

      <ConfirmDialog
        open={askConfirm}
        title="Create processing job"

        impact={<>{fmtQty(Number(form.inputQty))} {input?.uom} of <strong>{input?.name}</strong> leaves the warehouse into the processor's custody. A job slip and a material issue (delivery challan) are created.</>}
        confirmLabel="Create & Issue"
        isLoading={saving}
        onConfirm={save}
        onCancel={() => setAskConfirm(false)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ProcessingJobDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<ProcessingJobRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [rcv, setRcv] = useState({ receivedQty: '', shortageReason: '', processingCharges: '', otherCharges: '', remarks: '' });
  const [allowOver, setAllowOver] = useState(false);

  const load = () => processingJobsApi.get(id).then(setJob).catch(e => setProblem(toProblem(e))).finally(() => setLoading(false));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (e: React.ChangeEvent<HTMLInputElement>) => setRcv(r => ({ ...r, [e.target.name]: e.target.value }));
  const sent = job ? (job.remainingInCustody || job.inputQty) : 0;
  const received = Number(rcv.receivedQty);
  const shortage = rcv.receivedQty ? sent - received : null;
  const shortagePct = shortage != null && sent > 0 ? (shortage / sent) * 100 : null;
  const over = job ? received + (job.actualOutputQty ?? 0) > job.expectedOutputQty : false;

  const receive = async () => {
    setAsk(false); setBusy(true); setProblem(null); setNotice('');
    try {
      const res = await processingJobsApi.receive(id, {
        receivedQty: received,
        shortageReason: rcv.shortageReason || undefined,
        processingCharges: rcv.processingCharges !== '' ? Number(rcv.processingCharges) : undefined,
        otherCharges: rcv.otherCharges !== '' ? Number(rcv.otherCharges) : undefined,
        remarks: rcv.remarks || undefined,
        allowOverReceipt: allowOver || undefined,
      });
      setJob(res.job);
      setRcv({ receivedQty: '', shortageReason: '', processingCharges: '', otherCharges: '', remarks: '' });
      setNotice(res.receipt.status === 'CONFIRMED'
        ? `${fmtQty(received)} ${res.job.outputUom} of ${res.job.outputMaterial} received into stock (${res.receipt.docNo}).`
        : `Receipt ${res.receipt.docNo} saved as draft; a user with confirm rights must post it.`);
    } catch (e) {
      setProblem(toProblem(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading…</div>;
  if (!job) return <div className="max-w-3xl"><ErrorBox problem={problem ?? { detail: 'Processing job not found.' }} /></div>;

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <button onClick={() => navigate('/production/processing')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold">{job.jobNumber}</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium transition-colors bg-[#FFDCE5] text-[#B80037]">{JOB_SLIP_STATUS_LABEL[job.status]}</span>
          </div>
          <p className="text-sm text-slate-500 break-words">{job.processType} · {job.factoryName} · for {job.designNo}</p>
        </div>
      </div>

      <ErrorBox problem={problem} />
      {notice && <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg px-4 py-3"><CheckCircle size={16} className="shrink-0 mt-0.5" /> {notice}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: `Sent (${job.inputUom})`, v: fmtQty(job.sentQty || job.inputQty) },
          { l: `Expected (${job.outputUom})`, v: fmtQty(job.expectedOutputQty) },
          { l: `Received (${job.outputUom})`, v: job.actualOutputQty != null ? fmtQty(job.actualOutputQty) : '—' },
          { l: 'Shortage', v: job.shortage != null ? `${fmtQty(job.shortage)} (${job.shortagePercent}%)` : '—' },
        ].map(x => (
          <div key={x.l} className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
            <div className="text-xs text-slate-400">{x.l}</div>
            <div className="text-lg font-bold text-slate-900">{x.v}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-sm grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><span className="text-slate-400">Input:</span> {job.inputMaterial} — {fmtQty(job.inputQty)} {job.inputUom}</div>
        <div><span className="text-slate-400">Output:</span> {job.outputMaterial}</div>
        <div><span className="text-slate-400">Issued on:</span> {fmtDate(job.issueDate)}</div>
        <div><span className="text-slate-400">Return by:</span> {fmtDate(job.expectedReturnDate)}</div>
        <div><span className="text-slate-400">Still with processor:</span> {fmtQty(job.remainingInCustody)} {job.inputUom}</div>
        <RestrictedValue perm="receiving.rate.view"><div><span className="text-slate-400">Charges:</span> {CHARGE_BASIS_LABEL[job.chargeBasis]} @ {formatINR(job.agreedRate)}</div></RestrictedValue>
        {job.instructions && <div className="sm:col-span-2"><span className="text-slate-400">Instructions:</span> {job.instructions}</div>}
      </div>

      {job.canReceive && (
        <Can perm="receiving.edit">
          <div className="bg-white rounded-xl border border-amber-200 p-4 md:p-5 shadow-sm flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-amber-700">Record Receipt of Processed Material</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Quantity Received ({job.outputUom}) *</label>
                <input type="number" inputMode="decimal" name="receivedQty" value={rcv.receivedQty} onChange={set} min="0.001" step="0.001" placeholder="0.000" className={fieldCls} />
              </div>
              {shortage != null && (
                <div className="flex flex-col gap-1 justify-end pb-2 text-xs">
                  <span className="text-slate-500">Shortage: <strong>{fmtQty(shortage)} {job.inputUom}</strong></span>
                  <span className={`font-medium ${(shortagePct ?? 0) > 5 ? 'text-red-600' : 'text-slate-600'}`}>Shortage %: {shortagePct?.toFixed(2)}%</span>
                </div>
              )}
              {shortage != null && shortage > 0 && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Shortage Reason</label>
                  <input type="text" name="shortageReason" value={rcv.shortageReason} onChange={set} placeholder="e.g. shrinkage in dyeing" className={fieldCls} />
                </div>
              )}
              <Can perm="receiving.rate.view">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Processing Charges (₹) — blank = agreed rate</label>
                  <input type="number" inputMode="decimal" name="processingCharges" value={rcv.processingCharges} onChange={set} min="0" step="0.01" className={fieldCls} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expenses (₹)</label>
                  <input type="number" inputMode="decimal" name="otherCharges" value={rcv.otherCharges} onChange={set} min="0" step="0.01" className={fieldCls} />
                </div>
              </Can>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                <input type="text" name="remarks" value={rcv.remarks} onChange={set} className={fieldCls} />
              </div>
            </div>
            {over && (
              <label className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                <input type="checkbox" className="mt-1" checked={allowOver} onChange={e => setAllowOver(e.target.checked)} />
                <span>More than the expected {fmtQty(job.expectedOutputQty)}. Tick to accept (a reason in Remarks is required).</span>
              </label>
            )}
            <button type="button" disabled={!(received > 0) || busy} onClick={() => setAsk(true)} className="w-full sm:w-auto min-h-10 px-6 py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
              {busy ? 'Saving…' : 'Receive into Stock'}
            </button>
          </div>
        </Can>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm flex flex-col gap-2">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Documents</div>
        {job.issues?.map(i => (
          <div key={i._id} className="flex flex-wrap justify-between gap-2">
            <span>Issue {i.docNo} · {fmtDate(i.docDate)} · {fmtQty(i.qty)} {job.inputUom} · {i.status}</span>
            {i.status === 'CONFIRMED' && <a href={challanUrl(i._id)} target="_blank" rel="noreferrer" className="text-[#E40043] text-xs flex items-center gap-1 hover:underline"><FileText size={13} /> Delivery challan</a>}
          </div>
        ))}
        {job.receipts?.map(r => (
          <div key={r._id}>Receipt {r.docNo} · {fmtDate(r.docDate)} · {fmtQty(r.receivedQty)} {job.outputUom} · {r.status}{r.processingSummary ? ` · shortage ${fmtQty(r.processingSummary.shortageQty)} (${r.processingSummary.shortagePct}%)` : ''}{r.shortageReason ? ` — ${r.shortageReason}` : ''}</div>
        ))}
      </div>

      <Link to={`/production/reconciliation/${job.id}`} className="w-full sm:w-auto">
        <span className="flex items-center justify-center gap-2 min-h-10 px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm"><Scale size={15} /> Reconcile & Close</span>
      </Link>

      <ConfirmDialog
        open={ask}
        title="Receive processed material"
        impact={<>{fmtQty(received)} {job.outputUom} of <strong>{job.outputMaterial}</strong> enters the warehouse. All {fmtQty(job.remainingInCustody)} {job.inputUom} still with the processor is treated as converted{shortage != null && shortage > 0 ? `; shortage ${fmtQty(shortage)} (${shortagePct?.toFixed(2)}%) is recorded` : ''}.</>}
        confirmLabel="Receive"
        isLoading={busy}
        onConfirm={receive}
        onCancel={() => setAsk(false)}
      />
    </div>
  );
}
