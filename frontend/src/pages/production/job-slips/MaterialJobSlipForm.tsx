import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Shirt } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { designsApi, jobWorkersApi, toProblem, CHARGE_BASIS_LABEL, type ChargeBasis, type DesignRecord, type JobWorkerLite } from '../../../lib/api/production';
import { lotNumbersApi, todayISO } from '../../../lib/api/procurement';
import { materialJobSlipsApi, type AvailableLot, type MaterialJobSlipSummary } from '../../../lib/api/materialJobSlips';
import { QuickAddJobWorkerSheet } from '../../../components/forms/QuickAddJobWorkerSheet';
import { QuickAddDesignSheet } from '../../../components/forms/QuickAddDesignSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

interface InnerLine { key: string; lotId: string; qty: string }
/** A colour of a part; `inner` = extra colours inside it (e.g. a blue strip in a green top). */
interface ColourLine { key: string; lotId: string; qty: string; inner: InnerLine[] }
interface PartSection { key: string; part: string; avg: string; lines: ColourLine[] }
interface Shortage { lotNo?: string; name: string; required: number; available: number; uom?: string }

const newKey = () => Math.random().toString(36).slice(2, 9);
const section = (part: string): PartSection => ({ key: newKey(), part, avg: '', lines: [] });
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const num = (v: string) => Number(v) || 0;
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const METRE = /^m(tr|trs|eter|etre|eters|etres)?$/i;
const unitOf = (l?: AvailableLot) => (l?.uom && !METRE.test(l.uom) ? l.uom.toLowerCase() : 'm');

type Picker =
  | { kind: 'karigar' }
  | { kind: 'design' }
  | { kind: 'lot'; sectionKey: string; lineKey?: string; innerOf?: string; innerKey?: string }
  | null;

/**
 * Making job slip: give fabric to a karigar. Each part (Top / Bottom / Dupatta) can take several
 * colours from inward stock; average metres per piece gives the pieces expected per colour.
 * The design is optional (the karigar may make their own). Only inward stock can be picked.
 */
const embeddedLoadBlocked = () => false;

export function MaterialJobSlipForm({ embedded = false }: { embedded?: boolean } = {}) {
  const navigate = useNavigate();
  const [workers, setWorkers] = useState<JobWorkerLite[]>([]);
  const [designs, setDesigns] = useState<DesignRecord[]>([]);
  const [lots, setLots] = useState<AvailableLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [docDate, setDocDate] = useState(todayISO());
  const [challanNo, setChallanNo] = useState('');
  const [jobWorkerId, setJobWorkerId] = useState('');
  const [designId, setDesignId] = useState('');
  const [lotNo, setLotNo] = useState('');
  const [lotEdited, setLotEdited] = useState(false);
  const [chargeBasis, setChargeBasis] = useState<ChargeBasis>('PER_PIECE');
  const [agreedRate, setAgreedRate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sections, setSections] = useState<PartSection[]>(['TOP', 'BOTTOM', 'DUPATTA'].map(section));
  const [picker, setPicker] = useState<Picker>(null);
  const [addKarigar, setAddKarigar] = useState<string | null>(null);
  const [addDesign, setAddDesign] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [shortages, setShortages] = useState<Shortage[]>([]);

  useEffect(() => {
    Promise.all([jobWorkersApi.list(), materialJobSlipsApi.availableLots(), designsApi.list().catch(() => [] as DesignRecord[])])
      .then(([w, l, d]) => { setWorkers(w.filter(x => x.isActive)); setLots(l); setDesigns(d.filter(x => x.isActive)); })
      .catch(err => setLoadError(toProblem(err, 'Could not load karigars or stock.').detail))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!jobWorkerId || lotEdited) return;
    let alive = true;
    lotNumbersApi.nextForJobWorker(jobWorkerId).then(s => { if (alive) setLotNo(s.lotNo); }).catch(() => undefined);
    return () => { alive = false; };
  }, [jobWorkerId, lotEdited]);

  // Draft: everything typed is kept on this device until the slip is created or discarded.
  const draftValue = useMemo(
    () => ({ docDate, challanNo, jobWorkerId, designId, lotNo, lotEdited, chargeBasis, agreedRate, expectedDate, instructions, sections }),
    [docDate, challanNo, jobWorkerId, designId, lotNo, lotEdited, chargeBasis, agreedRate, expectedDate, instructions, sections],
  );
  const draft = useDraft('job-slip:making:new', draftValue, d => {
    setDocDate(d.docDate); setChallanNo(d.challanNo); setJobWorkerId(d.jobWorkerId); setDesignId(d.designId);
    setLotNo(d.lotNo); setLotEdited(d.lotEdited); setChargeBasis(d.chargeBasis); setAgreedRate(d.agreedRate);
    setExpectedDate(d.expectedDate); setInstructions(d.instructions);
    setSections(d.sections.map(sec => ({ ...sec, lines: sec.lines.map(l => ({ ...l, inner: l.inner ?? [] })) })));
  }, {
    enabled: !loading && !embeddedLoadBlocked(),
    isEmpty: v => !v.jobWorkerId && !v.challanNo && !v.sections.some(x => x.lines.length),
  });

  const lotById = useMemo(() => new Map(lots.map(l => [l.lotId, l])), [lots]);
  const karigar = workers.find(w => w._id === jobWorkerId);
  const design = designs.find(d => d._id === designId);

  const usedByLot = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sections) for (const l of s.lines) {
      if (l.lotId) m.set(l.lotId, (m.get(l.lotId) ?? 0) + num(l.qty));
      for (const i of l.inner) if (i.lotId) m.set(i.lotId, (m.get(i.lotId) ?? 0) + num(i.qty));
    }
    return m;
  }, [sections]);

  const updateSection = (key: string, patch: Partial<PartSection>) => setSections(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)));
  const updateLine = (sKey: string, lKey: string, patch: Partial<ColourLine>) =>
    setSections(prev => prev.map(s => (s.key === sKey ? { ...s, lines: s.lines.map(l => (l.key === lKey ? { ...l, ...patch } : l)) } : s)));
  const removeLine = (sKey: string, lKey: string) => setSections(prev => prev.map(s => (s.key === sKey ? { ...s, lines: s.lines.filter(l => l.key !== lKey) } : s)));
  const removeSection = (sKey: string) => setSections(prev => prev.filter(s => s.key !== sKey));
  const mapLine = (sKey: string, lKey: string, f: (l: ColourLine) => ColourLine) =>
    setSections(prev => prev.map(s => (s.key === sKey ? { ...s, lines: s.lines.map(l => (l.key === lKey ? f(l) : l)) } : s)));
  const updateInner = (sKey: string, lKey: string, iKey: string, patch: Partial<InnerLine>) =>
    mapLine(sKey, lKey, l => ({ ...l, inner: l.inner.map(i => (i.key === iKey ? { ...i, ...patch } : i)) }));
  const removeInner = (sKey: string, lKey: string, iKey: string) => mapLine(sKey, lKey, l => ({ ...l, inner: l.inner.filter(i => i.key !== iKey) }));

  const pickLot = (lot: AvailableLot) => {
    if (picker?.kind !== 'lot') return;
    const { sectionKey, lineKey, innerOf, innerKey } = picker;
    if (innerOf && innerKey) updateInner(sectionKey, innerOf, innerKey, { lotId: lot.lotId });
    else if (innerOf) mapLine(sectionKey, innerOf, l => ({ ...l, inner: [...l.inner, { key: newKey(), lotId: lot.lotId, qty: '' }] }));
    else if (lineKey) updateLine(sectionKey, lineKey, { lotId: lot.lotId });
    else setSections(prev => prev.map(s => (s.key === sectionKey ? { ...s, lines: [...s.lines, { key: newKey(), lotId: lot.lotId, qty: '', inner: [] }] } : s)));
    setPicker(null);
  };

  const pieces = (s: PartSection, l: ColourLine) => (num(s.avg) > 0 && num(l.qty) > 0 ? Math.floor(num(l.qty) / num(s.avg) + 1e-9) : null);
  const activeSections = sections.filter(s => s.lines.some(l => l.lotId));

  const validate = (): string | null => {
    if (!jobWorkerId) return 'Choose the karigar.';
    if (!activeSections.length) return 'Add at least one colour to Top, Bottom or Dupatta.';
    for (const s of activeSections) {
      if (!s.part.trim()) return 'Every part needs a name.';
      for (const l of s.lines) {
        if (!l.lotId) return `${cap(s.part)}: choose the lot for every colour.`;
        if (!(num(l.qty) > 0)) return `${cap(s.part)} · ${lotById.get(l.lotId)?.colourName ?? 'colour'}: enter the metres given.`;
        for (const i of l.inner) {
          if (!i.lotId) return `${cap(s.part)} · ${lotById.get(l.lotId)?.colourName ?? 'colour'}: choose the lot for every inner colour.`;
          if (!(num(i.qty) > 0)) return `${cap(s.part)} · inner ${lotById.get(i.lotId)?.colourName ?? 'colour'}: enter the metres given.`;
        }
      }
      if (s.avg && !(num(s.avg) > 0)) return `${cap(s.part)}: average metres per piece must be a positive number.`;
    }
    for (const [lotId, used] of usedByLot) {
      const l = lotById.get(lotId);
      if (l && used > l.available + 0.0005) return `Lot ${l.lotNo} (${l.name}) has only ${fmt(l.available)} ${unitOf(l)}, but ${fmt(used)} is entered.`;
    }
    return null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (v) { setError(v); setShortages([]); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    setError('');
    setConfirmOpen(true);
  };

  const save = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setShortages([]);
    try {
      const body = {
        jobWorkerId,
        designId: designId || undefined,
        docDate,
        challanNo: challanNo.trim() || undefined,
        lotNo: lotNo.trim() || undefined,
        chargeBasis,
        agreedRate: num(agreedRate),
        expectedCompletionDate: expectedDate || undefined,
        instructions: instructions.trim() || undefined,
        lines: activeSections.flatMap(s => s.lines.filter(l => l.lotId).flatMap(l => [
          {
            part: s.part.trim().toUpperCase(),
            lotId: l.lotId,
            qty: num(l.qty),
            route: 'DIRECT' as const,
            avgPerPiece: num(s.avg) > 0 ? num(s.avg) : undefined,
          },
          ...l.inner.filter(i => i.lotId).map(i => ({
            part: s.part.trim().toUpperCase(),
            lotId: i.lotId,
            qty: num(i.qty),
            route: 'DIRECT' as const,
            innerOfLotId: l.lotId,
          })),
        ])),
      };
      const res = await submitOrQueue<MaterialJobSlipSummary>({
        method: 'POST',
        url: '/job-slips/by-material',
        body,
        label: `Job slip · ${karigar?.name ?? 'karigar'}${lotNo ? ` · ${lotNo}` : ''}`,
      });
      draft.clear();
      if (res.queued) {
        window.alert('No internet — the job slip is saved on this phone and will be sent automatically when you are back online.');
        navigate('/production/job-slips');
      } else {
        navigate(`/production/job-slips/${res.data.id}`);
      }
    } catch (err) {
      const p = toProblem(err, 'Could not create the job slip.');
      setError(p.detail);
      setShortages(((p as unknown as { shortages?: Shortage[] }).shortages) ?? []);
      materialJobSlipsApi.availableLots().then(setLots).catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;

  // ---- picker contents -----------------------------------------------------------------------
  const karigarItems: PickerItem[] = workers.map(w => ({ id: w._id, title: w.name, subtitle: [w.type === 'FACTORY' ? 'Factory' : 'Karigar', w.specialty, w.mobile].filter(Boolean).join(' · '), keywords: w.mobile }));
  const designItems: PickerItem[] = designs.map(d => ({ id: d._id, title: d.name || d.designNo, subtitle: `Design ${d.designNo}${d.colourOptions?.length ? ` · ${d.colourOptions.length} colours` : ''}`, keywords: d.designNo }));
  const lotItems: PickerItem[] = lots.map(l => {
    const left = l.available - (usedByLot.get(l.lotId) ?? 0);
    return {
      id: l.lotId,
      title: l.name,
      subtitle: [`Lot ${l.lotNo}`, l.supplierName, l.thans.length ? `${l.thans.length} than${l.thans.length > 1 ? 's' : ''}` : '', l.costPerMeter ? `₹${l.costPerMeter.toFixed(2)}/${unitOf(l)}` : ''].filter(Boolean).join(' · '),
      meta: `${fmt(Math.max(0, left))} ${unitOf(l)}`,
      badge: l.partLabels?.length ? l.partLabels.map(cap).join('+') : undefined,
      keywords: `${l.lotNo} ${l.colourName ?? ''} ${l.materialName}`,
    };
  });

  const summaryRows = activeSections.flatMap(s => s.lines.filter(l => l.lotId).map(l => ({ s, l, lot: lotById.get(l.lotId), pcs: pieces(s, l) })));
  const confirmText = summaryRows.map(r => `${cap(r.s.part)} ${r.lot?.colourName ?? ''}: ${fmt(num(r.l.qty))} ${unitOf(r.lot)}${r.pcs !== null ? ` (~${r.pcs} pcs)` : ''}${r.l.inner.filter(i => i.lotId).map(i => ` + inner ${lotById.get(i.lotId)?.colourName ?? ''} ${fmt(num(i.qty))} m`).join('')}`).join('; ');

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {!embedded && (
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/production/job-slips')} className="icon-btn w-10 h-10" aria-label="Back"><ArrowLeft size={20} /></button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold">New Job Slip</h1>
            <p className="text-muted text-sm">Give fabric to a karigar. Only fabric received through purchase inward can be used.</p>
          </div>
        </div>
      )}

      {loadError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadError}</p>}
      {error && (
        <div className="animate-fade-in text-red-700 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p>{error}</p>
          {shortages.length > 0 && <ul className="mt-2 list-disc pl-5">{shortages.map((s, i) => <li key={i}>{s.name}{s.lotNo ? ` (lot ${s.lotNo})` : ''}: need {fmt(s.required)} {s.uom ?? ''}, have {fmt(s.available)} {s.uom ?? ''}</li>)}</ul>}
        </div>
      )}

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <form onSubmit={submit} className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Job Slip Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Date <span className="text-red-500">*</span></span>
              <input type="date" className="input-field" value={docDate} onChange={e => setDocDate(e.target.value)} required />
            </label>
            <Input label="Challan No." value={challanNo} onChange={e => setChallanNo(e.target.value)} placeholder="Written challan number" />
            <PickerField label={<>Karigar <span className="text-red-500">*</span></>} value={karigar?.name} hint={karigar?.type === 'FACTORY' ? 'Factory' : undefined} placeholder="Tap to choose karigar" onOpen={() => setPicker({ kind: 'karigar' })} />
            <PickerField
              label={<>Design <span className="text-muted font-normal">(optional)</span></>}
              value={design ? (design.name || design.designNo) : undefined}
              hint={design ? `Design ${design.designNo}` : undefined}
              placeholder="Karigar’s own / tap to choose"
              onOpen={() => setPicker({ kind: 'design' })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Lot No.</span>
              <input className="input-field uppercase" value={lotNo} onChange={e => { setLotNo(e.target.value); setLotEdited(true); }} placeholder={jobWorkerId ? 'Auto' : 'Choose karigar first'} />
              <span className="text-xs text-muted">
                {lotEdited
                  ? <button type="button" className="text-[var(--color-primary)] font-medium min-h-8" onClick={() => setLotEdited(false)}>Use automatic number</button>
                  : `Next number for ${karigar?.name ?? 'the karigar'} — you can change it.`}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Rate (₹)</span>
                <RestrictedValue perm="jobslips.view">
                  <input type="number" inputMode="decimal" min="0" step="any" className="input-field text-right" value={agreedRate} onChange={e => setAgreedRate(e.target.value)} placeholder="0" />
                </RestrictedValue>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Per</span>
                <select className="input-field" value={chargeBasis} onChange={e => setChargeBasis(e.target.value as ChargeBasis)}>
                  {(Object.keys(CHARGE_BASIS_LABEL) as ChargeBasis[]).map(c => <option key={c} value={c}>{CHARGE_BASIS_LABEL[c]}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Return by</span>
              <input type="date" className="input-field" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </label>
          </div>
        </Card>

        {sections.map(s => {
          const sectionPcs = s.lines.reduce((a, l) => a + (pieces(s, l) ?? 0), 0);
          const sectionM = s.lines.reduce((a, l) => a + num(l.qty), 0);
          return (
            <Card key={s.key} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2">
                <Shirt size={18} className="text-[var(--color-primary)] shrink-0" />
                <input className="flex-1 min-w-0 font-semibold text-lg uppercase bg-transparent outline-none" value={s.part} onChange={e => updateSection(s.key, { part: e.target.value })} placeholder="PART NAME" aria-label="Part name" />
                {sectionM > 0 && <span className="text-sm tabular text-muted shrink-0">{fmt(sectionM)} m{sectionPcs > 0 ? ` · ${sectionPcs} pcs` : ''}</span>}
                <button type="button" onClick={() => removeSection(s.key)} className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-500 shrink-0" aria-label={`Remove ${s.part}`}><Trash2 size={18} /></button>
              </div>

              <label className="flex items-center gap-3">
                <span className="text-sm font-medium flex-1">Average metres per piece</span>
                <input type="number" inputMode="decimal" min="0.001" step="any" className="input-field text-right w-28" value={s.avg} onChange={e => updateSection(s.key, { avg: e.target.value })} placeholder="e.g. 2.5" />
              </label>

              {s.lines.length === 0 && <p className="text-sm text-muted">No colour yet — add the fabric for {cap(s.part || 'this part')}.</p>}

              <div className="flex flex-col gap-2">
                {s.lines.map(l => {
                  const lot = lotById.get(l.lotId);
                  const left = lot ? lot.available - (usedByLot.get(l.lotId) ?? 0) : undefined;
                  const pcs = pieces(s, l);
                  return (
                    <div key={l.key} className="flex flex-col gap-2 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] animate-fade-up">
                      <div className="flex items-start gap-2">
                        <PickerField
                          className="flex-1"
                          value={lot ? `${lot.colourName ?? lot.name}` : undefined}
                          hint={lot ? `${lot.name} · lot ${lot.lotNo}` : undefined}
                          placeholder="Choose colour / lot"
                          onOpen={() => setPicker({ kind: 'lot', sectionKey: s.key, lineKey: l.key })}
                        />
                        <button type="button" onClick={() => removeLine(s.key, l.key)} className="w-10 h-11 flex items-center justify-center text-slate-400 hover:text-red-500" aria-label="Remove colour"><Trash2 size={18} /></button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="number" inputMode="decimal" min="0.001" step="any" className="input-field text-right flex-1" value={l.qty} onChange={e => updateLine(s.key, l.key, { qty: e.target.value })} placeholder={`${unitOf(lot) === 'm' ? 'Metres' : unitOf(lot)} given`} aria-label="Quantity given" />
                        <span className="text-sm text-muted w-6">{unitOf(lot)}</span>
                        <span className={`text-sm font-semibold tabular min-w-20 text-right ${pcs !== null ? 'text-[#B80037]' : 'text-slate-300'}`}>{pcs !== null ? `= ${pcs} pcs` : '— pcs'}</span>
                      </div>
                      {lot && (
                        <span className={`text-xs ${left !== undefined && left < -0.0005 ? 'text-red-600 font-medium' : 'text-muted'}`}>
                          {left !== undefined && left < -0.0005 ? `Short by ${fmt(-left)} ${unitOf(lot)}` : `${fmt(Math.max(0, left ?? 0))} ${unitOf(lot)} left in lot`}
                          {unitOf(lot) !== 'm' ? ` · this lot was received in ${unitOf(lot)}s, not metres` : ''}
                        </span>
                      )}

                      {l.inner.length > 0 && (
                        <div className="flex flex-col gap-2 pl-3 border-l-2 border-[var(--color-primary-200,#FFB8CA)]">
                          {l.inner.map(i => {
                            const il = lotById.get(i.lotId);
                            return (
                              <div key={i.key} className="flex flex-col gap-1.5 animate-fade-up">
                                <div className="flex items-start gap-2">
                                  <PickerField
                                    className="flex-1"
                                    value={il ? `Inner: ${il.colourName ?? il.name}` : undefined}
                                    hint={il ? `${il.name} · lot ${il.lotNo}` : undefined}
                                    placeholder="Choose inner colour"
                                    onOpen={() => setPicker({ kind: 'lot', sectionKey: s.key, innerOf: l.key, innerKey: i.key })}
                                  />
                                  <button type="button" onClick={() => removeInner(s.key, l.key, i.key)} className="w-10 h-11 flex items-center justify-center text-slate-400 hover:text-red-500" aria-label="Remove inner colour"><Trash2 size={16} /></button>
                                </div>
                                <div className="flex items-center gap-2">
                                  <input type="number" inputMode="decimal" min="0.001" step="any" className="input-field text-right flex-1" value={i.qty} onChange={e => updateInner(s.key, l.key, i.key, { qty: e.target.value })} placeholder="Metres given" aria-label="Inner colour metres" />
                                  <span className="text-sm text-muted w-6">{unitOf(il)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {l.lotId && (
                        <button type="button" onClick={() => setPicker({ kind: 'lot', sectionKey: s.key, innerOf: l.key })} className="self-start text-sm font-medium text-[var(--color-primary)] min-h-10 py-2 pr-2 -my-1">
                          + Add inner colour {lot?.colourName ? `in ${lot.colourName}` : ''}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button type="button" variant="secondary" onClick={() => setPicker({ kind: 'lot', sectionKey: s.key })} className="w-full md:w-auto md:self-start">
                <Plus size={16} /> Add colour
              </Button>
            </Card>
          );
        })}

        <Button type="button" variant="ghost" onClick={() => setSections(prev => [...prev, section('')])} className="self-start">
          <Plus size={16} /> Add another part
        </Button>

        {summaryRows.some(r => r.pcs !== null) && (
          <Card className="flex flex-col gap-2">
            <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Pieces expected</h3>
            {activeSections.map(s => (
              <div key={s.key} className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">{s.part} {num(s.avg) > 0 ? `· ${fmt(num(s.avg))} m / piece` : ''}</span>
                {s.lines.filter(l => l.lotId).map(l => {
                  const lot = lotById.get(l.lotId);
                  const pcs = pieces(s, l);
                  return (
                    <div key={l.key} className="flex justify-between text-sm tabular">
                      <span>{lot?.colourName ?? lot?.name} <span className="text-muted">({fmt(num(l.qty))} {unitOf(lot)})</span></span>
                      <span className="font-semibold">{pcs !== null ? `${pcs} pcs` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>
        )}

        <Card className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Instructions for the karigar</span>
            <textarea className="input-field min-h-20" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="optional" />
          </label>
        </Card>

        <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 z-10 bg-[var(--color-background)]/95 backdrop-blur p-4 border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <Button type="button" variant="secondary" onClick={() => navigate('/production/job-slips')} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" isLoading={saving} className="w-full sm:w-auto">Give to Karigar</Button>
        </div>
      </form>

      <PickerSheet
        open={picker?.kind === 'karigar'}
        title="Choose karigar"
        items={karigarItems}
        selectedId={jobWorkerId}
        searchPlaceholder="Search karigar or factory…"
        onSelect={it => { setJobWorkerId(it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
        onCreate={q => { setPicker(null); setAddKarigar(q); }}
        createLabel="karigar"
      />
      <PickerSheet
        open={picker?.kind === 'design'}
        title="Choose design (optional)"
        items={designItems}
        selectedId={designId}
        searchPlaceholder="Search design no. or name…"
        emptyText="No design found — leave it empty if the karigar makes their own."
        onSelect={it => { setDesignId(it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
        onCreate={q => { setPicker(null); setAddDesign(q); }}
        createLabel="design"
        footer={designId ? <Button type="button" variant="secondary" className="w-full" onClick={() => { setDesignId(''); setPicker(null); }}>No design — karigar’s own</Button> : undefined}
      />
      <PickerSheet
        open={picker?.kind === 'lot'}
        title="Choose fabric from inward stock"
        items={lotItems}
        selectedId={picker?.kind === 'lot' && picker.lineKey ? sections.find(s => s.key === picker.sectionKey)?.lines.find(l => l.key === picker.lineKey)?.lotId : undefined}
        searchPlaceholder="Search colour, material or lot no…"
        emptyText="No fabric in the main warehouse matches. Do a purchase inward first."
        onSelect={it => { const lot = lotById.get(it.id); if (lot) pickLot(lot); }}
        onClose={() => setPicker(null)}
      />

      <QuickAddJobWorkerSheet
        open={addKarigar !== null}
        initialName={addKarigar ?? ''}
        onClose={() => setAddKarigar(null)}
        onCreated={w => { setWorkers(prev => [...prev, w].sort((a, b) => a.name.localeCompare(b.name))); setJobWorkerId(w._id); setAddKarigar(null); }}
      />
      <QuickAddDesignSheet
        open={addDesign !== null}
        initialName={addDesign ?? ''}
        onClose={() => setAddDesign(null)}
        onCreated={d => { setDesigns(prev => [d, ...prev]); setDesignId(d._id); setAddDesign(null); }}
      />

      <ConfirmDialog
        open={confirmOpen}
        title="Give fabric to karigar?"
        impact={`${karigar?.name ?? 'Karigar'} — lot ${lotNo || 'auto'}${design ? ` · design ${design.designNo}` : ''}. ${confirmText}. The fabric leaves the main warehouse now.`}
        confirmLabel="Give to Karigar"
        isLoading={saving}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
