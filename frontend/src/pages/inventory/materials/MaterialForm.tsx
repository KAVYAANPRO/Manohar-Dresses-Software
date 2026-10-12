import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft, Plus } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { PickerSheet, PickerField } from '../../../components/forms/PickerSheet';
import { UnitPickerField } from '../../../components/forms/UnitPickerField';
import { ColourPickerField } from '../../../components/forms/ColourPickerField';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { QuickAddMasterSheet } from '../../../components/forms/QuickAddMasterSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

const EMPTY_MATERIAL = { name: '', categoryId: '', fabricType: '', baseUomId: '', minStock: '', isActive: true };
import {
  materialsApi, materialCategoriesApi, uomsApi, coloursApi, problemMessage,
  type CategoryRecord, type UomRecord, type ColourRecord, type MaterialRecord,
} from '../../../lib/api/procurement';

type VariantRow = { _id: string; code?: string; colourId: ColourRecord | null; isActive: boolean };

export function MaterialForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [uoms, setUoms] = useState<UomRecord[]>([]);
  const [colours, setColours] = useState<ColourRecord[]>([]);
  const [material, setMaterial] = useState<MaterialRecord | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [newColour, setNewColour] = useState('');
  const [addingVariant, setAddingVariant] = useState(false);
  const [catPickerOpen, setCatPickerOpen] = useState(false);
  const [addCategoryName, setAddCategoryName] = useState<string | null>(null);
  const [queuedMsg, setQueuedMsg] = useState('');

  const [formData, setFormData] = useState(EMPTY_MATERIAL);
  const draft = useDraft('material:new', formData, setFormData, {
    enabled: !isLoading && !isEditing,
    isEmpty: d => !d.name.trim() && !d.categoryId && !d.fabricType.trim() && !d.baseUomId && !d.minStock,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [c, u, col] = await Promise.all([materialCategoriesApi.list(), uomsApi.list(), coloursApi.list()]);
        if (!active) return;
        setCategories(c); setUoms(u); setColours(col);
        if (id) {
          const [m, v] = await Promise.all([materialsApi.get(id), materialsApi.variants(id)]);
          if (!active) return;
          setMaterial(m);
          setVariants(v);
          setFormData({
            name: m.name, categoryId: m.categoryId, fabricType: m.fabricType ?? '', baseUomId: m.baseUomId,
            minStock: m.minStockQty !== undefined && m.minStockQty !== null ? String(m.minStockQty) : '', isActive: m.isActive,
          });
        }
      } catch (err) {
        if (active) setError(problemMessage(err, 'Could not load material.'));
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };



  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.categoryId) { setError('Select a category.'); return; }
    if (!formData.baseUomId) { setError('Select the base unit.'); return; }
    setIsSaving(true);
    setError('');
    const body = {
      name: formData.name.trim(),
      categoryId: formData.categoryId,
      fabricType: formData.fabricType.trim() || undefined,
      baseUomId: formData.baseUomId,
      minStockQty: formData.minStock === '' ? undefined : Number(formData.minStock),
    };
    try {
      if (material) {
        await materialsApi.update(material._id, body);
        if (formData.isActive !== material.isActive) await materialsApi.setActive(material._id, formData.isActive);
        navigate('/inventory/materials');
      } else {
        const res = await submitOrQueue<MaterialRecord>({ method: 'POST', url: '/materials', body, label: `Material · ${body.name}` });
        draft.clear();
        if (res.queued) {
          setQueuedMsg("Saved on this device — it will be sent when you're back online. Add its colours after it has been sent.");
          window.setTimeout(() => navigate('/inventory/materials'), 2200);
          return;
        }
        // Straight to the edit screen so colours can be added.
        navigate(`/inventory/materials/${res.data._id}`, { replace: true });
      }
    } catch (err) {
      setError(problemMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const addVariant = async () => {
    if (!material || !newColour.trim()) return;
    setAddingVariant(true);
    try {
      const existing = colours.find(c => c.name.toLowerCase() === newColour.trim().toLowerCase());
      await materialsApi.addVariant(material._id, existing ? { colourId: existing._id } : { colourName: newColour.trim() });
      setVariants(await materialsApi.variants(material._id));
      if (!existing) setColours(await coloursApi.list());
      setNotice(`Colour ${newColour.trim()} added.`);
      setNewColour('');
      setError('');
    } catch (err) {
      setError(problemMessage(err));
    } finally {
      setAddingVariant(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const baseUomCode = uoms.find(u => u._id === formData.baseUomId)?.code ?? '';

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/inventory/materials')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Material' : 'New Material'}</h1>
          <p className="text-muted">Enter the master details for this material.</p>
        </div>
      </div>

      {!isEditing && <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setFormData(EMPTY_MATERIAL); }} />}
      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {notice && !error && <p className="text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{notice}</p>}

      <form onSubmit={handleSubmit}>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Material Name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Cotton Cambric 60s" required />
            <Input label="Fabric Type (optional)" name="fabricType" value={formData.fabricType} onChange={handleChange} placeholder="e.g. Cambric, Rayon, Georgette" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PickerField
              label="Category"
              value={categories.find(c => c._id === formData.categoryId)?.name}
              placeholder="Tap to choose category"
              onOpen={() => setCatPickerOpen(true)}
            />

            <div className="input-group">
              <UnitPickerField
                label="Base Unit of Measure"
                uoms={uoms.filter(u => u.isActive || u._id === formData.baseUomId)}
                value={formData.baseUomId}
                onChange={u => setFormData(prev => ({ ...prev, baseUomId: u }))}
              />
              <span className="text-xs text-muted mt-1">Stock is held in this unit. Other purchase units need a conversion.</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={`Minimum Stock Level${baseUomCode ? ` (${baseUomCode})` : ''}`}
              name="minStock"
              type="number" inputMode="decimal"
              min="0"
              step="0.001"
              value={formData.minStock}
              onChange={handleChange}
              placeholder="optional — low-stock alert below this"
            />
            {material && (
              <ChoiceChips
                label="Status"
                value={formData.isActive ? 'Active' : 'Inactive'}
                options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
                onChange={v => setFormData(p => ({ ...p, isActive: v === 'Active' }))}
              />
            )}
          </div>

          <Can perm="materials.edit">
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
              <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/inventory/materials')}>
                Cancel
              </Button>
              <Button className="w-full sm:w-auto" type="submit" isLoading={isSaving}>
                {material ? 'Save Material' : 'Save & Add Colours'}
              </Button>
            </div>
          </Can>
        </Card>
      </form>

      {material && (
        <Card className="flex flex-col gap-4">
          <div className="border-b border-[var(--color-border)] pb-2">
            <h3 className="font-semibold text-lg">Colours (stocked variants)</h3>
            <p className="text-xs text-muted">Each colour of this material is stocked separately. Colours typed on a purchase or inward are added here automatically.</p>
          </div>
          {variants.length === 0 ? (
            <p className="text-sm text-slate-400">No colours yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {variants.map(v => (
                <span key={v._id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white text-sm">
                  {v.colourId?.hexCode && <span className="w-3 h-3 rounded-full border" style={{ background: v.colourId.hexCode }} />}
                  {v.colourId?.name ?? '—'}{v.code ? <span className="text-xs text-slate-400">{v.code}</span> : null}
                </span>
              ))}
            </div>
          )}
          <Can perm="materials.edit">
            <div className="flex flex-col sm:flex-row gap-2">
              <ColourPickerField
                className="flex-1"
                options={colours.filter(c => c.isActive && !variants.some(v => v.colourId?._id === c._id)).map(c => c.name)}
                value={newColour}
                onChange={setNewColour}
                placeholder="Tap to choose or add a colour"
              />
              <Button type="button" variant="outline" onClick={addVariant} isLoading={addingVariant} disabled={!newColour.trim()}>
                <Plus size={16} /> Add Colour
              </Button>
            </div>
          </Can>
        </Card>
      )}

      <PickerSheet
        open={catPickerOpen}
        title="Choose category"
        items={categories.filter(c => c.isActive || c._id === formData.categoryId).map(c => ({ id: c._id, title: c.name }))}
        selectedId={formData.categoryId}
        searchPlaceholder="Search category…"
        onSelect={it => { setFormData(prev => ({ ...prev, categoryId: it.id })); setCatPickerOpen(false); }}
        onClose={() => setCatPickerOpen(false)}
        createLabel="category"
        onCreate={q => { setCatPickerOpen(false); setAddCategoryName(q); }}
      />
      <QuickAddMasterSheet
        open={addCategoryName !== null}
        noun="material category"
        endpoint="/material-categories"
        initialName={addCategoryName ?? ''}
        namePlaceholder="e.g. Fabric, Lace, Buttons"
        onClose={() => setAddCategoryName(null)}
        onCreated={r => {
          setCategories(prev => [...prev, { _id: r._id, name: r.name, isActive: true }]);
          setFormData(prev => ({ ...prev, categoryId: r._id }));
          setAddCategoryName(null);
        }}
      />
    </div>
  );
}

