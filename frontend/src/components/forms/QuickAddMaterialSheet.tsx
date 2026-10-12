import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import {
  materialsApi, materialCategoriesApi, problemMessage,
  type CategoryRecord, type MaterialRecord, type UomRecord,
} from '../../lib/api/procurement';

interface QuickAddMaterialSheetProps {
  open: boolean;
  /** Pre-fills the name (e.g. what the user was searching for). */
  initialName?: string;
  uoms: UomRecord[];
  onClose: () => void;
  onCreated: (material: MaterialRecord) => void;
}

/**
 * Create a raw material without leaving the current form (purchase inward, PO).
 * Bottom sheet on phones, centred dialog on desktop. Only the fields the backend requires
 * (name, category, base unit) plus fabric type and minimum stock; everything else is editable
 * later under Inventory → Materials.
 */
export function QuickAddMaterialSheet({ open, initialName = '', uoms, onClose, onCreated }: QuickAddMaterialSheetProps) {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [baseUomId, setBaseUomId] = useState('');
  const [fabricType, setFabricType] = useState('');
  const [minStockQty, setMinStockQty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setError('');
    materialCategoriesApi.list()
      .then(c => {
        const active = c.filter(x => x.isActive);
        setCategories(active);
        if (active.length && !categoryId) setCategoryId(active[0]._id);
      })
      .catch(err => setError(problemMessage(err, 'Could not load material categories.')));
    // Default unit: metre if it exists, else the first unit.
    if (!baseUomId && uoms.length) {
      setBaseUomId((uoms.find(u => /^m(tr|eter|etre)?$/i.test(u.code)) ?? uoms[0])._id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const usingNewCategory = categoryId === '__new__' || categories.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the material name.');
    if (usingNewCategory && !newCategory.trim()) return setError('Enter a category name.');
    if (!baseUomId) return setError('Select the unit.');
    setSaving(true);
    setError('');
    try {
      let catId = categoryId;
      if (usingNewCategory) {
        const cat = await materialCategoriesApi.create({ name: newCategory.trim() } as Partial<CategoryRecord>);
        catId = cat._id;
      }
      const created = await materialsApi.create({
        name: name.trim(),
        categoryId: catId,
        baseUomId,
        ...(fabricType.trim() ? { fabricType: fabricType.trim() } : {}),
        ...(minStockQty ? { minStockQty: Number(minStockQty) } : {}),
      } as Partial<MaterialRecord>);
      onCreated(created);
      setNewCategory('');
      setFabricType('');
      setMinStockQty('');
    } catch (err) {
      setError(problemMessage(err, 'Could not create the material.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      ariaLabelledBy="quick-add-material-title"
      className="w-full md:max-w-md md:rounded-2xl flex flex-col"
    >
        <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
          <h3 id="quick-add-material-title" className="font-semibold text-lg">Add New Material</h3>
          <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4 pb-4">
          {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Material name <span className="text-red-500">*</span></span>
            <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cotton Cambric 60s" autoFocus />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Category <span className="text-red-500">*</span></span>
            {categories.length > 0 && (
              <select className="input-field" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                <option value="__new__">+ New category…</option>
              </select>
            )}
            {usingNewCategory && (
              <input className="input-field" value={newCategory} onChange={e => setNewCategory(e.target.value)} placeholder="e.g. Fabric, Trims, Thread" />
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Unit <span className="text-red-500">*</span></span>
              <select className="input-field" value={baseUomId} onChange={e => setBaseUomId(e.target.value)}>
                <option value="">— Unit —</option>
                {uoms.map(u => <option key={u._id} value={u._id}>{u.name} ({u.code})</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Min. stock</span>
              <input className="input-field text-right" type="number" inputMode="decimal" min="0" step="0.01" value={minStockQty} onChange={e => setMinStockQty(e.target.value)} placeholder="optional" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Fabric type</span>
            <input className="input-field" value={fabricType} onChange={e => setFabricType(e.target.value)} placeholder="optional, e.g. Cotton, Rayon, Georgette" />
          </label>

          <p className="text-xs text-muted">Colours are added automatically when you inward this material in a new colour.</p>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
            <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" isLoading={saving} className="w-full sm:w-auto">Add Material</Button>
          </div>
        </div>
    </ModalShell>
  );
}
