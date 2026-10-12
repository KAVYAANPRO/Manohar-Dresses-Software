import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { PickerSheet, PickerField } from './PickerSheet';
import { QuickAddMasterSheet } from './QuickAddMasterSheet';
import { designsApi, lookupsApi, toProblem, type DesignRecord, type NamedRecord } from '../../lib/api/production';

interface Props {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (design: DesignRecord) => void;
}

/**
 * Add a design from inside a job slip / order. A design is known only by its code (no separate
 * name); colours are chosen later (outward), so only code, category and sizes are asked.
 * Category opens a search page where a new category can also be added.
 */
export function QuickAddDesignSheet({ open, initialName = '', onClose, onCreated }: Props) {
  const [categories, setCategories] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [designNo, setDesignNo] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [catPicker, setCatPicker] = useState(false);
  const [addCategory, setAddCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setDesignNo(initialName.toUpperCase());
    Promise.all([lookupsApi.productCategories(), lookupsApi.sizes()])
      .then(([c, s]) => {
        const activeCats = c.filter(x => x.isActive !== false);
        setCategories(activeCats);
        setCategoryId(prev => prev || activeCats[0]?._id || '');
        const activeSizes = s.filter(x => x.isActive !== false);
        setSizes(activeSizes);
        setSizeIds(activeSizes.map(x => x._id));
      })
      .catch(err => setError(toProblem(err, 'Could not load categories or sizes.').detail));
  }, [open, initialName]);

  const toggle = (id: string) => setSizeIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = designNo.trim().toUpperCase();
    if (!code) return setError('Enter the design code.');
    if (!categoryId) return setError('Choose the category (or add a new one).');
    setSaving(true); setError('');
    try {
      const created = await designsApi.create({ designNo: code, name: code, productCategoryId: categoryId, colourOptions: [], sizeOptions: sizeIds });
      onCreated(created);
    } catch (err) {
      setError(toProblem(err, 'Could not add the design.').detail);
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) => `pressable min-h-10 px-3 rounded-full border text-sm font-medium transition-colors ${on ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'bg-white border-[var(--color-border)] text-slate-700'}`;
  const category = categories.find(c => c._id === categoryId);

  return (
    <>
      <ModalShell open={open} onClose={onClose} as="form" onSubmit={submit} ariaLabelledBy="qa-design-title" className="w-full md:max-w-md md:rounded-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
          <h3 id="qa-design-title" className="font-semibold text-lg">Add New Design</h3>
          <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="flex flex-col gap-3 px-4 pb-4">
          {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Design code <span className="text-red-500">*</span></span>
            <input className="input-field uppercase" value={designNo} onChange={e => setDesignNo(e.target.value)} placeholder="e.g. MD-1042" autoFocus />
          </label>
          <PickerField
            label={<span className="text-xs font-medium text-muted">Category <span className="text-red-500">*</span></span>}
            value={category?.name}
            placeholder="Tap to choose category"
            onOpen={() => setCatPicker(true)}
          />
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium text-muted">Sizes</span>
            <div className="flex flex-wrap gap-2">
              {sizes.map(s => <button key={s._id} type="button" className={chip(sizeIds.includes(s._id))} onClick={() => toggle(s._id)}>{s.name}</button>)}
              {sizes.length === 0 && <span className="text-xs text-muted">No sizes yet — add them under Masters → Sizes.</span>}
            </div>
          </div>
          <p className="text-xs text-muted">Colours are chosen later. Material recipe, rate and photos can be added under Designs.</p>
          <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={saving}>Add Design</Button>
          </div>
        </div>
      </ModalShell>

      <PickerSheet
        open={catPicker}
        title="Choose category"
        items={categories.map(c => ({ id: c._id, title: c.name }))}
        selectedId={categoryId}
        searchPlaceholder="Search category…"
        onSelect={it => { setCategoryId(it.id); setCatPicker(false); }}
        onClose={() => setCatPicker(false)}
        onCreate={q => { setCatPicker(false); setAddCategory(q); }}
        createLabel="category"
      />
      <QuickAddMasterSheet
        open={addCategory !== null}
        noun="category"
        endpoint="/product-categories"
        initialName={addCategory ?? ''}
        namePlaceholder="e.g. Kurti Set, Gown, Lehenga"
        onClose={() => setAddCategory(null)}
        onCreated={rec => {
          setCategories(prev => [...prev, { _id: rec._id, name: rec.name, isActive: true } as NamedRecord].sort((a, b) => a.name.localeCompare(b.name)));
          setCategoryId(rec._id);
          setAddCategory(null);
        }}
      />
    </>
  );
}
