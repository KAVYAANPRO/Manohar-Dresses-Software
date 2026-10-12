import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Droplets, Check } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { jobWorkersApi, toProblem, type JobWorkerLite } from '../../../lib/api/production';
import { lotNumbersApi, todayISO } from '../../../lib/api/procurement';
import { materialJobSlipsApi, type AvailableLot } from '../../../lib/api/materialJobSlips';
import { PART_OPTIONS, PROCESS_OPTIONS, type ProcessRateBasis } from '../../../lib/api/processingBatches';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { QuickAddJobWorkerSheet } from '../../../components/forms/QuickAddJobWorkerSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import type { ProcessingBatchDetail } from '../../../lib/api/processingBatches';

interface ColourRow { key: string; colour: string; thans: string[] }
interface Shortage { lotNo?: string; name: string; required: number; available: number; uom?: string }

const METRE = /^(m|mtr|mtrs|meter|metre|meters|metres)$/i;
const newKey = () => Math.random().toString(36).slice(2, 9);
const colourRow = (): ColourRow => ({ key: newKey(), colour: '', thans: [''] });
const n = (v: string) => Number(v) || 0;
const fmt = (x: number, d = 3) => x.toLocaleString('en-IN', { maximumFractionDigits: d });
const money = (x: number) => `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const COLOUR_SUGGESTIONS = ['Rani Pink', 'Red', 'Maroon', 'Royal Blue', 'Navy Blue', 'Sky Blue', 'Black', 'Bottle Green', 'Mustard', 'Yellow', 'Peach', 'Lavender', 'Wine', 'Beige', 'Off White'];

/**
 * Processing job slip: parts of a lot go to a processor (dyeing etc.) in one or more colours,
 * than by than, with the processor's rate and travel/other expenses; cost per metre is shown live.
 */
export function ProcessingBatchForm() {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<JobWorkerLite[]>([]);
  const [lots, setLots] = useState<AvailableLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [docDate, setDocDate] = useState(todayISO());
  const [challanNo, setChallanNo] = useState('');
  const [processorId, setProcessorId] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [lotEdited, setLotEdited] = useState(false);
  const [process, setProcess] = useState<string>('DYEING');
  const [otherProcess, setOtherProcess] = useState('');
  const [parts, setParts] = useState<string[]>(['DUPATTA']);
  const [rate, setRate] = useState('');
  const [rateBasis, setRateBasis] = useState<ProcessRateBasis>('PER_METER');
  const [expenses, setExpenses] = useState('');
  const [returnBy, setReturnBy] = useState('');
  const [lotId, setLotId] = useState('');
  const [rows, setRows] = useState<ColourRow[]>([colourRow()]);
  const [activeKey, setActiveKey] = useState<string>('');
  /** Which of the lot's own thans have been given to a colour (by index). */
  const [usedThans, setUsedThans] = useState<Record<number, string>>({});

  const [picker, setPicker] = useState<'processor' | 'lot' | null>(null);
  const [addProcessor, setAddProcessor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [shortages, setShortages] = useState<Shortage[]>([]);

  useEffect(() => {
    Promise.all([jobWorkersApi.list(), materialJobSlipsApi.availableLots()])
      .then(([w, l]) => { setWorkers(w.filter(x => x.isActive)); setLots(l); })
      .catch(err => setLoadError(toProblem(err, 'Could not load processors or stock.').detail))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!processorId || lotEdited) return;
    let alive = true;
    lotNumbersApi.nextForJobWorker(processorId).then(s => { if (alive) setLotNo(s.lotNo); }).catch(() => undefined);
    return () => { alive = false; };
  }, [processorId, lotEdited]);

  const draftValue = useMemo(
    () => ({ docDate, challanNo, processorId, lotNo, lotEdited, process, otherProcess, parts, rate, rateBasis, expenses, returnBy, lotId, rows, usedThans }),
    [docDate, challanNo, processorId, lotNo, lotEdited, process, otherProcess, parts, rate, rateBasis, expenses, returnBy, lotId, rows, usedThans],
  );
  const draft = useDraft('job-slip:processing:new', draftValue, d => {
    setDocDate(d.docDate); setChallanNo(d.challanNo); setProcessorId(d.processorId); setLotNo(d.lotNo); setLotEdited(d.lotEdited);
    setProcess(d.process); setOtherProcess(d.otherProcess); setParts(d.parts); setRate(d.rate); setRateBasis(d.rateBasis);
    setExpenses(d.expenses); setReturnBy(d.returnBy); setLotId(d.lotId); setRows(d.rows); setUsedThans(d.usedThans);
  }, { enabled: !loading, isEmpty: v => !v.processorId && !v.lotId && !v.challanNo });

  const metreLots = useMemo(() => lots.filter(l => !l.uom || METRE.test(l.uom)), [lots]);
  const otherUnitLots = lots.length - metreLots.length;
  const lot = lots.find(l => l.lotId === lotId);

  const totalSent = rows.reduce((a, r) => a + r.thans.reduce((b, t) => b + n(t), 0), 0);
  const thanCount = rows.reduce((a, r) => a + r.thans.filter(t => n(t) > 0).length, 0);
  const fabricPerM = lot?.costPerMeter ?? 0;
  const expPerM = totalSent > 0 ? n(expenses) / totalSent : 0;
  const beforePerM = fabricPerM + expPerM;
  const processPerM = rateBasis === 'PER_METER' ? n(rate) : totalSent > 0 ? n(rate) / totalSent : 0;
  const processorTotal = rateBasis === 'PER_METER' ? n(rate) * totalSent : n(rate);

  const updateRow = (key: string, patch: Partial<ColourRow>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const setThan = (key: string, i: number, v: string) => setRows(prev => prev.map(r => (r.key === key ? { ...r, thans: r.thans.map((t, j) => (j === i ? v : t)) } : r)));
  const addThan = (key: string) => setRows(prev => prev.map(r => (r.key === key ? { ...r, thans: [...r.thans, ''] } : r)));
  const removeThan = (key: string, i: number) => {
    setUsedThans(prev => Object.fromEntries(Object.entries(prev).filter(([, k]) => k !== `${key}:${i}`)));
    setRows(prev => prev.map(r => (r.key === key ? { ...r, thans: r.thans.length > 1 ? r.thans.filter((_, j) => j !== i) : [''] } : r)));
  };
  const removeRow = (key: string) => {
    setUsedThans(prev => Object.fromEntries(Object.entries(prev).filter(([, k]) => !k.startsWith(`${key}:`))));
    setRows(prev => (prev.length > 1 ? prev.filter(r => r.key !== key) : prev));
  };

  /** Give one of the lot's thans to the selected colour (fills its first empty than box). */
  const assignThan = (idx: number, metres: number) => {
    if (usedThans[idx]) return;
    const key = activeKey || rows[rows.length - 1].key;
    const r = rows.find(x => x.key === key);
    if (!r) return;
    let slot = r.thans.findIndex(t => !t);
    const thans = [...r.thans];
    if (slot < 0) { slot = thans.length; thans.push(''); }
    thans[slot] = String(metres);
    updateRow(key, { thans });
    setUsedThans(prev => ({ ...prev, [idx]: `${key}:${slot}` }));
  };

  const pickLot = (id: string) => { setLotId(id); setUsedThans({}); setRows([colourRow()]); };
  const toggleArr = (arr: string[], v: string) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);

  const processName = process === 'OTHER' ? otherProcess.trim() : process;
  const activeRows = rows.filter(r => r.colour.trim() || r.thans.some(t => n(t) > 0));

  const validate = (): string | null => {
    if (!processorId) return 'Choose the processor (dyer).';
    if (!processName) return 'Enter the process name.';
    if (!parts.length) return 'Choose at least one part — Top, Bottom or Dupatta.';
    if (!lotId) return 'Choose the fabric lot.';
    if (!activeRows.length) return 'Add at least one colour.';
    for (const r of activeRows) {
      if (!r.colour.trim()) return 'Every colour line needs a colour name.';
      if (!r.thans.some(t => n(t) > 0)) return `${r.colour}: enter the metres of each than.`;
      if (r.thans.some(t => t !== '' && !(n(t) > 0))) return `${r.colour}: each than must be a positive number of metres.`;
    }
    if (lot && totalSent > lot.available + 0.0005) return `Lot ${lot.lotNo} has only ${fmt(lot.available)} m, but ${fmt(totalSent)} m is entered.`;
    return null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); setShortages([]); return; }
    setError('');
    setConfirmOpen(true);
  };

  const save = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setShortages([]);
    try {
      const body = {
        processorJobWorkerId: processorId,
        processName,
        parts,
        rate: n(rate),
        rateBasis,
        expenses: n(expenses) || undefined,
        docDate,
        challanNo: challanNo.trim() || undefined,
        lotNo: lotNo.trim() || undefined,
        expectedReturnDate: returnBy || undefined,
        lines: activeRows.map(r => ({ lotId, colourName: r.colour.trim(), thans: r.thans.map(n).filter(t => t > 0) })),
      };
      const res = await submitOrQueue<ProcessingBatchDetail>({
        method: 'POST', url: '/processing-batches', body,
        label: `${processName || 'Processing'} · ${workers.find(w => w._id === processorId)?.name ?? 'processor'} · ${activeRows.map(r => r.colour).join(', ')}`,
      });
      draft.clear();
      if (res.queued) { window.alert('No internet — saved on this phone; it will be sent automatically when you are back online.'); navigate('/production/job-slips'); }
      else navigate(`/production/job-slips/${res.data.id}`);
    } catch (err) {
      const p = toProblem(err, 'Could not create the processing job.');
      setError(p.detail);
      setShortages(((p as unknown as { shortages?: Shortage[] }).shortages) ?? []);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;

  const processor = workers.find(w => w._id === processorId);
  const chip = (on: boolean) =>
    `pressable min-h-10 px-3.5 rounded-full border text-sm font-medium transition-colors ${on ? 'bg-[#E40043] border-[#E40043] text-white' : 'bg-white border-[var(--color-border)] text-slate-700'}`;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {loadError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadError}</p>}
      {error && (
        <div className="animate-fade-in text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p>{error}</p>
          {shortages.length > 0 && <ul className="mt-2 list-disc pl-5">{shortages.map((s, i) => <li key={i}>{s.name}{s.lotNo ? ` (lot ${s.lotNo})` : ''}: sending {fmt(s.required)} m, have {fmt(s.available)} m</li>)}</ul>}
        </div>
      )}

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />
      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Processing Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Date <span className="text-red-500">*</span></span>
            <input type="date" className="input-field" value={docDate} onChange={e => setDocDate(e.target.value)} required />
          </label>
          <Input label="Challan No." value={challanNo} onChange={e => setChallanNo(e.target.value)} placeholder="Written challan number" />
          <PickerField
            label={<>Processor (dyer) <span className="text-red-500">*</span></>}
            value={workers.find(w => w._id === processorId)?.name}
            placeholder="Tap to choose processor"
            onOpen={() => setPicker('processor')}
          />
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Lot No.</span>
            <input className="input-field uppercase" value={lotNo} onChange={e => { setLotNo(e.target.value); setLotEdited(true); }} placeholder={processorId ? 'Auto' : 'Select processor first'} />
            <span className="text-xs text-muted">
              {lotEdited
                ? <button type="button" className="text-[var(--color-primary)] font-medium min-h-8" onClick={() => setLotEdited(false)}>Use automatic number</button>
                : `Next number for ${processor?.name ?? 'the processor'} — you can change it.`}
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Return by</span>
            <input type="date" className="input-field" value={returnBy} onChange={e => setReturnBy(e.target.value)} />
          </label>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Process <span className="text-red-500">*</span></span>
          <div className="flex flex-wrap gap-2">
            {PROCESS_OPTIONS.map(p => (
              <button key={p} type="button" className={chip(process === p)} onClick={() => setProcess(p)}>
                {p === 'OTHER' ? 'Other' : p.charAt(0) + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          {process === 'OTHER' && <input className="input-field" value={otherProcess} onChange={e => setOtherProcess(e.target.value)} placeholder="Process name, e.g. Starching" />}
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Parts going <span className="text-red-500">*</span></span>
          <div className="flex flex-wrap gap-2">
            {PART_OPTIONS.map(p => (
              <button key={p} type="button" className={chip(parts.includes(p))} onClick={() => setParts(prev => toggleArr(prev, p))} aria-pressed={parts.includes(p)}>
                {parts.includes(p) && <Check size={14} className="inline -mt-0.5 mr-1" />}
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 border-b border-[var(--color-border)] pb-2">
          <h3 className="font-semibold text-lg">Fabric & Colours</h3>
          <p className="text-xs text-muted">Pick the lot, then give its thans to each colour — tap a than below or type the metres.</p>
        </div>

        {metreLots.length === 0 ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No fabric (in metres) in the main warehouse. Do a purchase inward first, entering the metres of each than.</p>
        ) : (
          <PickerField
            label={<>Fabric lot <span className="text-red-500">*</span></>}
            value={lot ? lot.name : undefined}
            hint={lot ? `Lot ${lot.lotNo} · ${fmt(lot.available)} m available` : undefined}
            placeholder="Tap to choose fabric from inward"
            onOpen={() => setPicker('lot')}
          />
        )}
        {otherUnitLots > 0 && (
          <p className="text-xs text-muted">{otherUnitLots} lot(s) counted in thans/pieces are hidden — processing needs metres. Re-enter those inwards with the metres of each than.</p>
        )}

        {lot && lot.thans.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">Thans in this lot (as received) — tap to give to {rows.find(r => r.key === activeKey)?.colour || 'the selected colour'}</span>
            <div className="flex flex-wrap gap-2">
              {lot.thans.map((t, i) => (
                <button key={i} type="button" disabled={!!usedThans[i]} onClick={() => assignThan(i, t)}
                  className={`pressable min-h-10 px-3 rounded-lg border text-sm tabular transition-colors ${usedThans[i] ? 'bg-slate-100 border-slate-200 text-slate-400 line-through' : 'bg-[#FFF0F3] border-[#FFB8CA] text-[#B80037] font-semibold'}`}>
                  {fmt(t)} m
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {rows.map((r, idx) => {
            const sum = r.thans.reduce((a, t) => a + n(t), 0);
            const active = (activeKey || rows[rows.length - 1].key) === r.key;
            return (
              <div key={r.key} onClick={() => setActiveKey(r.key)}
                className={`flex flex-col gap-3 p-3 md:p-4 rounded-lg border transition-colors ${active ? 'border-[#E40043] bg-[#FFF6F8]' : 'border-[var(--color-border)] bg-[var(--color-background)]'}`}>
                <div className="flex items-center gap-2">
                  <Droplets size={18} className="text-[#E40043] shrink-0" />
                  <input className="input-field font-semibold flex-1" value={r.colour} onChange={e => updateRow(r.key, { colour: e.target.value })} list="processing-colours" placeholder={`Colour ${idx + 1}, e.g. Rani Pink`} aria-label={`Colour ${idx + 1}`} />
                  {rows.length > 1 && (
                    <button type="button" onClick={e => { e.stopPropagation(); removeRow(r.key); }} className="w-10 h-10 flex items-center justify-center text-red-400 hover:text-red-600" aria-label="Remove colour"><Trash2 size={18} /></button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted">Thans — metres in each</span>
                  <span className="text-sm font-semibold tabular">{fmt(sum)} m · {r.thans.filter(t => n(t) > 0).length} than(s)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {r.thans.map((t, i) => (
                    <div key={i} className="relative">
                      <input type="number" inputMode="decimal" min="0.001" step="any" className="input-field text-right pr-7" value={t} onChange={e => setThan(r.key, i, e.target.value)} placeholder={`Than ${i + 1} (m)`} aria-label={`${r.colour || 'Colour'} than ${i + 1} metres`} />
                      {r.thans.length > 1 && (
                        <button type="button" onClick={() => removeThan(r.key, i)} className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-400 hover:text-red-500" aria-label="Remove than">×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" onClick={() => addThan(r.key)} className="pressable min-h-10 rounded-lg border border-dashed border-[var(--color-border)] text-sm font-medium text-[var(--color-primary)]">+ Than</button>
                </div>
              </div>
            );
          })}
          <datalist id="processing-colours">{COLOUR_SUGGESTIONS.map(c => <option key={c} value={c} />)}</datalist>
          <Button type="button" variant="secondary" onClick={() => { const r = colourRow(); setRows(prev => [...prev, r]); setActiveKey(r.key); }} className="w-full md:w-auto md:self-start">
            <Plus size={16} /> Add Colour
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Rate & Cost</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Processor rate (₹)</span>
              <input type="number" inputMode="decimal" min="0" step="any" className="input-field text-right" value={rate} onChange={e => setRate(e.target.value)} placeholder="e.g. 8.50" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Per</span>
              <select className="input-field" value={rateBasis} onChange={e => setRateBasis(e.target.value as ProcessRateBasis)}>
                <option value="PER_METER">Metre sent</option>
                <option value="LUMP_SUM">Whole job</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Expenses (₹)</span>
            <input type="number" inputMode="decimal" min="0" step="any" className="input-field text-right" value={expenses} onChange={e => setExpenses(e.target.value)} placeholder="travel, transport…" />
          </label>
        </div>

        <RestrictedValue perm="processing.view">
          <div className="rounded-lg border border-[#FFB8CA] bg-[#FFF6F8] p-3 flex flex-col gap-1.5 text-sm tabular">
            <div className="flex justify-between"><span className="text-muted">Metres sent</span><span className="font-medium">{fmt(totalSent)} m in {thanCount} than(s)</span></div>
            <div className="flex justify-between"><span className="text-muted">Fabric cost</span><span>{money(fabricPerM)} / m</span></div>
            <div className="flex justify-between"><span className="text-muted">+ Expenses {n(expenses) > 0 && totalSent > 0 ? `(${money(n(expenses))} ÷ ${fmt(totalSent)} m)` : ''}</span><span>{money(expPerM)} / m</span></div>
            <div className="flex justify-between font-semibold border-t border-[#FFB8CA] pt-1.5"><span>Cost before {processName ? processName.toLowerCase() : 'processing'}</span><span>{money(beforePerM)} / m</span></div>
            <div className="flex justify-between"><span className="text-muted">+ {processName ? processName.charAt(0) + processName.slice(1).toLowerCase() : 'Processing'} rate</span><span>{money(processPerM)} / m</span></div>
            <div className="flex justify-between font-semibold text-[#B80037]"><span>Cost after (if no shrinkage)</span><span>{money(beforePerM + processPerM)} / m</span></div>
            <div className="flex justify-between text-xs text-muted pt-1"><span>Processor’s charge for this job</span><span>{money(processorTotal)}</span></div>
            <p className="text-xs text-muted">Real cost per metre is worked out when thans come back: shrinkage spreads the cost over fewer metres.</p>
          </div>
        </RestrictedValue>
      </Card>

      <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-[var(--color-background)]/90 backdrop-blur p-4 border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <Button type="button" variant="secondary" onClick={() => navigate('/production/job-slips')} className="w-full sm:w-auto">Cancel</Button>
        <Button type="submit" isLoading={saving} className="w-full sm:w-auto">Send for {processName ? processName.toLowerCase() : 'processing'}</Button>
      </div>

      <PickerSheet
        open={picker === 'processor'}
        title="Choose processor (dyer)"
        items={workers.map((w): PickerItem => ({ id: w._id, title: w.name, subtitle: [w.type === 'FACTORY' ? 'Factory' : 'Karigar', w.specialty, w.mobile].filter(Boolean).join(' · '), keywords: w.mobile }))}
        selectedId={processorId}
        searchPlaceholder="Search dyer / processor…"
        onSelect={it => { setProcessorId(it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
        onCreate={q => { setPicker(null); setAddProcessor(q); }}
        createLabel="dyer / processor"
      />
      <QuickAddJobWorkerSheet
        open={addProcessor !== null}
        initialName={addProcessor ?? ''}
        defaultType="FACTORY"
        onClose={() => setAddProcessor(null)}
        onCreated={w => { setWorkers(prev => [...prev, w].sort((a, b) => a.name.localeCompare(b.name))); setProcessorId(w._id); setAddProcessor(null); }}
      />
      <PickerSheet
        open={picker === 'lot'}
        title="Choose fabric from inward stock"
        items={metreLots.map((l): PickerItem => ({
          id: l.lotId,
          title: l.name,
          subtitle: [`Lot ${l.lotNo}`, l.supplierName, l.thans.length ? `${l.thans.length} thans: ${l.thans.map(t => fmt(t)).join(' + ')} m` : ''].filter(Boolean).join(' · '),
          meta: `${fmt(l.available)} m`,
          badge: l.partLabels?.length ? l.partLabels.join('+') : undefined,
          keywords: `${l.lotNo} ${l.colourName ?? ''} ${l.materialName}`,
        }))}
        selectedId={lotId}
        searchPlaceholder="Search colour, material or lot no…"
        emptyText="No fabric (in metres) in the main warehouse matches."
        onSelect={it => { pickLot(it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
      />

      <ConfirmDialog
        open={confirmOpen}
        title={`Send to ${processor?.name ?? 'processor'}?`}
        impact={`${parts.map(p => p.toLowerCase()).join(' + ')} · ${activeRows.map(r => `${r.colour}: ${fmt(r.thans.reduce((a, t) => a + n(t), 0))} m`).join(', ')}. ${fmt(totalSent)} m leaves the main warehouse now; it comes back to the office after ${processName.toLowerCase() || 'processing'}.`}
        confirmLabel="Send"
        isLoading={saving}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
    </form>
  );
}
