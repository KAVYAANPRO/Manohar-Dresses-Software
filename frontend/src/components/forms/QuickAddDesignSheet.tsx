import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { designsApi, lookupsApi, toProblem, type DesignRecord, type NamedRecord } from '../../lib/api/production';

interface Props {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (design: DesignRecord) => void;
}

/**
 * Add a design from inside a job slip / order. Only design no., name, category, colours and
 * sizes (what the backend needs); everything else (BOM, rate, photos) later under Designs.
 * All sizes are pre-selected; colours start empty and at least one is required.
 */
export function QuickAddDesignSheet({ open, initialName = '', onClose, onCreated }: Props) {
  const [categories, setCategories] = useState<NamedRecord[]>([]);
  const [colours, setColours] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [designNo, setDesignNo] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [colourIds, setColourIds] = useState<string[]>([]);
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [colourQ, setColourQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(''); setColourIds([]); setColourQ('');
    // A typed search is usually the design number ("D-102") or a name.
    if (/\d/.test(initialName)) { setDesignNo(initialName); setName(''); } else { setName(initialName); setDesignNo(''); }
    Promise.all([lookupsApi.productCategories(), lookupsApi.colours(), lookupsApi.sizes()])
      .then(([c, col, s]) => {
        const activeCats = c.filter(x => x.isActive !== false);
        setCategories(activeCats);
        setCategoryId(prev => prev || activeCats[0]?._id || '');
        setColours(col.filter(x => x.isActive !== false));
        const activeSizes = s.filter(x => x.isActive !== false);
        setSizes(activeSizes);
        setSizeIds(activeSizes.map(x => x._id));
      })
      .catch(err => setError(toProblem(err, 'Could not load categories, colours or sizes.').detail));
  }, [open, initialName]);

  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!designNo.trim()) return setError('Enter the design number.');
    if (!name.trim()) return setError('Enter the design name.');
    if (!categoryId) return setError('Choose a product category (add one under Masters → Categories first).');
    if (!colourIds.length) return setError('Choose at least one colour.');
    if (!sizeIds.length) return setError('Choose at least one size.');
    setSaving(true); setError('');
    try {
      const created = await designsApi.create({ designNo: designNo.trim(), name: name.trim(), productCategoryId: categoryId, colourOptions: colourIds, sizeOptions: sizeIds });
      onCreated(created);
    } catch (err) {
      setError(toProblem(err, 'Could not add the design.').detail);
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) => `pressable min-h-10 px-3 rounded-full border text-sm font-medium transition-colors ${on ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'bg-white border-[var(--color-border)] text-slate-700'}`;
  const shownColours = colours.filter(c => !colourQ.trim() || c.name.toLowerCase().includes(colourQ.trim().toLowerCase()));

  return (
    <ModalShell open={open} onClose={onClose} as="form" onSubmit={submit} ariaLabelledBy="qa-design-title" className="w-full md:max-w-lg md:rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
        <h3 id="qa-design-title" className="font-semibold text-lg">Add New Design</h3>
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Design no. <span className="text-red-500">*</span></span>
            <input className="input-field uppercase" value={designNo} onChange={e => setDesignNo(e.target.value)} placeholder="e.g. MD-1042" autoFocus />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Name <span className="text-red-500">*</span></span>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Anarkali Set" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Category <span className="text-red-500">*</span></span>
          <select className="input-field" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            {categories.length === 0 && <option value="">No categories yet</option>}
            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Colours <span className="text-red-500">*</span> {colourIds.length ? `· ${colourIds.length} chosen` : ''}</span>
          {colours.length > 10 && <input className="input-field" value={colourQ} onChange={e => setColourQ(e.target.value)} placeholder="Search colour…" />}
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
            {shownColours.map(c => (
              <button key={c._id} type="button" className={chip(colourIds.includes(c._id))} onClick={() => setColourIds(prev => toggle(prev, c._id))}>
                {colourIds.includes(c._id) && <Check size={14} className="inline -mt-0.5 mr-1" />}{c.name}
              </button>
            ))}
            {colours.length === 0 && <span className="text-xs text-muted">No colours in the colour master yet.</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted">Sizes <span className="text-red-500">*</span></span>
          <div className="flex flex-wrap gap-2">
            {sizes.map(s => (
              <button key={s._id} type="button" className={chip(sizeIds.includes(s._id))} onClick={() => setSizeIds(prev => toggle(prev, s._id))}>{s.name}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted">Material recipe, rate and photos can be added later under Designs.</p>
        <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Add Design</Button>
        </div>
      </div>
    </ModalShell>
  );
}
