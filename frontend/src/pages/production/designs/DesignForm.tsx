import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft, Plus, Trash2, Camera, X } from 'lucide-react';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { QuickAddMasterSheet } from '../../../components/forms/QuickAddMasterSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import {
  designsApi, lookupsApi, toProblem, fmtQty,
  type NamedRecord, type MaterialOption, type BomLineInput, type DesignInput,
} from '../../../lib/api/production';
import { STAGGER_CHILDREN } from '../../pageKit';

interface BOMItem {
  key: string;
  materialVariantId: string;
  qtyPerGarmentBase: number;
  allowancePct: number;
  /** Which garment part this material goes into (free text: Top, Bottom, Dupatta, Lining, Trim...). */
  role: string;
}

const ROLE_SUGGESTIONS = ['Top', 'Bottom', 'Dupatta', 'Lining', 'Trim', 'Common'];

const EMPTY_DESIGN = {
  designNo: '',
  name: '',
  productCategoryId: '',
  productType: '',
  description: '',
  expectedProductionQty: '',
  defaultSellingRate: '',
  hsn: '',
  manufacturingInstructions: '',
  notes: '',
  status: 'Active' as 'Active' | 'Inactive',
};

const emptyLine = (): BOMItem => ({ key: `l-${Date.now()}-${Math.random()}`, materialVariantId: '', qtyPerGarmentBase: 1, allowancePct: 0, role: 'Top' });

function sameBom(a: BomLineInput[], b: BomLineInput[]) {
  const norm = (x: BomLineInput[]) => JSON.stringify(x.map(l => [l.role.trim(), l.materialVariantId, Number(l.qtyPerGarmentBase), Number(l.allowancePct)]));
  return norm(a) === norm(b);
}

export function DesignForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [loadError, setLoadError] = useState('');

  const [categories, setCategories] = useState<NamedRecord[]>([]);
  const [colours, setColours] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);

  const [formData, setFormData] = useState(EMPTY_DESIGN);
  const [colourIds, setColourIds] = useState<string[]>([]);
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [bomItems, setBomItems] = useState<BOMItem[]>([emptyLine()]);
  const [original, setOriginal] = useState<{ version: number; rate?: number; active: boolean; bom: BomLineInput[] } | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [picker, setPicker] = useState<null | { kind: 'category' } | { kind: 'material'; key: string }>(null);
  const [quickAdd, setQuickAdd] = useState<null | { kind: 'category' | 'colour' | 'size'; name: string }>(null);
  const [notice, setNotice] = useState('');

  // A new design being typed in is kept on this device (the photo is not - pick it again).
  const draft = useDraft(
    'design:new',
    { formData, colourIds, sizeIds, bomItems },
    d => { setFormData({ ...EMPTY_DESIGN, ...d.formData }); setColourIds(d.colourIds ?? []); setSizeIds(d.sizeIds ?? []); setBomItems(d.bomItems?.length ? d.bomItems : [emptyLine()]); },
    {
      enabled: !isLoading && !isEditing,
      isEmpty: d => !d.formData.designNo.trim() && !d.formData.name.trim() && !d.formData.productCategoryId && !d.colourIds.length && !d.sizeIds.length && d.bomItems.every(l => !l.materialVariantId),
    },
  );

  useEffect(() => {
    const loads: Promise<unknown>[] = [
      lookupsApi.productCategories().then(setCategories),
      lookupsApi.colours().then(c => setColours(c.filter(x => x.isActive !== false))),
      lookupsApi.sizes().then(s => setSizes(s.filter(x => x.isActive !== false))),
      lookupsApi.materialOptions().then(setMaterials),
    ];
    if (isEditing && id) {
      loads.push(Promise.all([designsApi.get(id), designsApi.bom(id)]).then(([d, bom]) => {
        setFormData({
          designNo: d.designNo,
          name: d.name,
          productCategoryId: d.productCategoryId,
          productType: d.productType ?? '',
          description: d.description ?? '',
          expectedProductionQty: d.expectedProductionQty != null ? String(d.expectedProductionQty) : '',
          defaultSellingRate: d.defaultSellingRate != null ? String(d.defaultSellingRate) : '',
          hsn: d.hsn ?? '',
          manufacturingInstructions: d.manufacturingInstructions ?? '',
          notes: d.notes ?? '',
          status: d.isActive ? 'Active' : 'Inactive',
        });
        setColourIds(d.colourOptions.map(String));
        setSizeIds(d.sizeOptions.map(String));
        if (d.imageUrls?.length) setPhotoUrl(d.imageUrls[d.imageUrls.length - 1]);
        const lines = (bom?.lines ?? []).map(l => ({ role: l.role, materialVariantId: String(l.materialVariantId), qtyPerGarmentBase: l.qtyPerGarmentBase, allowancePct: l.allowancePct }));
        setBomItems(lines.length ? lines.map(l => ({ ...l, key: `l-${Math.random()}` })) : [emptyLine()]);
        setOriginal({ version: d.version, rate: d.defaultSellingRate, active: d.isActive, bom: lines });
      }));
    }
    Promise.all(loads)
      .catch(err => setLoadError(toProblem(err, 'Could not load the design form.').detail))
      .finally(() => setIsLoading(false));
  }, [isEditing, id]);


  const uomOf = (variantId: string) => materials.find(m => m.materialVariantId === variantId)?.uom ?? '';

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setPhotoError('Only PNG, JPG or WEBP files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('File is larger than 5MB.');
      return;
    }
    setPhotoError('');
    setPhotoFile(file);
    setPhotoUrl(URL.createObjectURL(file));
  };

  const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const toggle = (list: string[], set: (v: string[]) => void, value: string) => {
    set(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const handleBOMChange = (key: string, field: keyof BOMItem, value: string | number) => {
    setBomItems(prev => prev.map(item => item.key === key ? { ...item, [field]: value } : item));
  };

  const removeBOMItem = (key: string) => {
    setBomItems(prev => (prev.length > 1 ? prev.filter(item => item.key !== key) : [emptyLine()]));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaveError('');
    if (!formData.productCategoryId) { setSaveError('Select a product category.'); return; }
    if (colourIds.length === 0 || sizeIds.length === 0) { setSaveError('Pick at least one colour and one size — variants are generated from them.'); return; }
    const bomLines: BomLineInput[] = bomItems
      .filter(l => l.materialVariantId)
      .map(l => ({ role: l.role.trim() || 'Common', materialVariantId: l.materialVariantId, qtyPerGarmentBase: Number(l.qtyPerGarmentBase), allowancePct: Number(l.allowancePct) || 0 }));
    if (bomLines.some(l => !(l.qtyPerGarmentBase > 0))) { setSaveError('Every BOM line needs a quantity per garment above 0.'); return; }

    const payload: DesignInput = {
      designNo: formData.designNo.trim(),
      name: formData.name.trim(),
      productCategoryId: formData.productCategoryId,
      productType: formData.productType || undefined,
      description: formData.description || undefined,
      colourOptions: colourIds,
      sizeOptions: sizeIds,
      expectedProductionQty: formData.expectedProductionQty ? Number(formData.expectedProductionQty) : undefined,
      manufacturingInstructions: formData.manufacturingInstructions || undefined,
      hsn: formData.hsn || undefined,
      notes: formData.notes || undefined,
    };
    const rate = formData.defaultSellingRate !== '' ? Number(formData.defaultSellingRate) : undefined;

    setIsSaving(true);
    let designId = id;
    // No internet: a design with only its details can be saved on this device and sent later.
    // The BOM and photo need the saved design, so with those the form stays as a draft instead.
    if (!isEditing && typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsSaving(false);
      if (bomLines.length > 0 || photoFile) {
        setSaveError('No internet. Your design is kept on this device as a draft — open New Design again when you are back online and tap Save (the BOM needs the design to be saved first).');
        return;
      }
      const res = await submitOrQueue({ method: 'POST', url: '/designs', body: { ...payload, defaultSellingRate: rate }, label: `Design · ${payload.designNo} ${payload.name}`.trim() });
      if (res.queued) {
        draft.clear();
        setNotice("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/production/designs'), 1800);
        return;
      }
      draft.clear();
      navigate(`/production/designs/${(res.data as { _id: string })._id}`);
      return;
    }
    try {
      if (isEditing && id && original) {
        const { designNo: _no, ...updatable } = payload;
        void _no;
        await designsApi.update(id, updatable, original.version);
        if (rate !== undefined && rate !== original.rate) await designsApi.setRate(id, rate);
        const wantActive = formData.status === 'Active';
        if (wantActive !== original.active) await designsApi.setActive(id, wantActive);
      } else {
        const created = await designsApi.create({ ...payload, defaultSellingRate: rate });
        designId = created._id;
        draft.clear();
      }
      if (designId && bomLines.length > 0 && (!original || !sameBom(bomLines, original.bom))) {
        await designsApi.setBom(designId, bomLines);
      }
    } catch (err) {
      setSaveError(toProblem(err, 'Could not save the design.').detail);
      setIsSaving(false);
      // A new design that saved but whose BOM failed: continue editing it rather than creating a duplicate.
      if (!isEditing && designId) navigate(`/production/designs/${designId}/edit`, { replace: true });
      return;
    }

    if (photoFile && designId) {
      try {
        await designsApi.uploadImage(designId, photoFile);
      } catch (err) {
        setIsSaving(false);
        setSaveError(`Design saved, but the photo could not be uploaded: ${toProblem(err).detail}`);
        if (!isEditing) navigate(`/production/designs/${designId}/edit`, { replace: true });
        return;
      }
    }
    setIsSaving(false);
    navigate(designId ? `/production/designs/${designId}` : '/production/designs');
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  const categoryName = categories.find(c => c._id === formData.productCategoryId)?.name;
  const materialField = (item: BOMItem) => {
    const m = materials.find(x => x.materialVariantId === item.materialVariantId);
    return (
      <PickerField
        value={m?.name}
        hint={m ? `${m.uom || '—'} · stock ${fmtQty(m.mainWhOnHand)}` : undefined}
        placeholder="Tap to choose material"
        onOpen={() => setPicker({ kind: 'material', key: item.key })}
      />
    );
  };
  const chip = (selected: boolean) =>
    `px-3 min-h-10 rounded-full text-sm font-medium border transition-colors ${selected ? 'bg-[#E40043] text-white border-[#E40043]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3 md:gap-4">
        <button onClick={() => navigate(isEditing ? `/production/designs/${id}` : '/production/designs')} className="icon-btn shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Design' : 'New Design'}</h1>
          <p className="text-muted">Define design details, colour/size options and the Bill of Materials (BOM).</p>
        </div>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}
      {!isEditing && <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setFormData(EMPTY_DESIGN); setColourIds([]); setSizeIds([]); setBomItems([emptyLine()]); }} />}
      {notice && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{notice}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <Card className="flex flex-col gap-4 h-full">
              <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2 mb-2">Design Information</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input label="Design No." name="designNo" value={formData.designNo} onChange={handleHeaderChange} placeholder="e.g. DR-1024" required disabled={isEditing} hint={isEditing ? 'Design number cannot change once saved.' : undefined} />
                <Input label="Design Name" name="name" value={formData.name} onChange={handleHeaderChange} placeholder="e.g. Summer Floral Dress" required />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PickerField
                  label="Product Category *"
                  value={categoryName}
                  placeholder="Tap to choose category"
                  onOpen={() => setPicker({ kind: 'category' })}
                />
                <Input label="Product Type" name="productType" value={formData.productType} onChange={handleHeaderChange} placeholder="e.g. 2-piece, 3-piece" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input label="Default Selling Rate (₹)" name="defaultSellingRate" type="number" inputMode="decimal" min="0" step="0.01" value={formData.defaultSellingRate} onChange={handleHeaderChange} />
                <Input label="Expected Production Qty" name="expectedProductionQty" type="number" inputMode="numeric" min="0" value={formData.expectedProductionQty} onChange={handleHeaderChange} />
                <Input label="HSN" name="hsn" value={formData.hsn} onChange={handleHeaderChange} placeholder="e.g. 6204" />
              </div>

              {isEditing && (
                <ChoiceChips
                  label="Status"
                  value={formData.status}
                  options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
                  onChange={v => setFormData(prev => ({ ...prev, status: v }))}
                />
              )}

              <div className="input-group">
                <label className="input-label">Description</label>
                <textarea name="description" value={formData.description} onChange={handleHeaderChange} className="input-field min-h-[70px] resize-y" placeholder="Optional details about this design..." />
              </div>
              <div className="input-group">
                <label className="input-label">Manufacturing Instructions</label>
                <textarea name="manufacturingInstructions" value={formData.manufacturingInstructions} onChange={handleHeaderChange} className="input-field min-h-[70px] resize-y" placeholder="Sent with every job slip for this design" />
              </div>
            </Card>
          </div>

          <div className="md:col-span-1">
            <Card className="flex flex-col gap-4 h-full items-center justify-center min-h-[250px] bg-slate-50 border-dashed border-2 relative">
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePhotoSelect} />
              {photoUrl ? (
                <>
                  <img src={photoUrl} alt="Design preview" className="w-full h-40 object-cover rounded-lg" />
                  {photoFile && (
                    <button
                      type="button"
                      onClick={() => { setPhotoFile(null); setPhotoUrl(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 shadow flex items-center justify-center text-slate-500 hover:text-red-500"
                      aria-label="Remove photo"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <Button type="button" variant="outline" className="text-xs py-1 px-3" onClick={() => fileInputRef.current?.click()}>
                    {photoFile ? 'Replace Photo' : 'Add Another Photo'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 mb-2">
                    <Camera size={32} />
                  </div>
                  <p className="text-sm font-medium text-slate-600 text-center">Upload Design Image</p>
                  <p className="text-xs text-slate-400 text-center max-w-[200px]">PNG, JPG or WEBP up to 5MB. Uploaded when you save.</p>
                  <Button type="button" variant="outline" className="mt-2 text-xs py-1 px-3" onClick={() => fileInputRef.current?.click()}>
                    Browse Files
                  </Button>
                </>
              )}
              {photoError && <p className="text-xs text-red-600 text-center">{photoError}</p>}
            </Card>
          </div>
        </div>

        <Card className="flex flex-col gap-4">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Colours & Sizes</h3>
          <p className="text-xs text-muted -mt-2">Every colour × size combination becomes a variant (the finished-stock unit). Removing an option later never deletes an existing variant.</p>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Colours *</div>
            <div className="flex flex-wrap gap-2">
              {colours.map(c => (
                <button type="button" key={c._id} className={chip(colourIds.includes(c._id))} onClick={() => toggle(colourIds, setColourIds, c._id)}>{c.name}</button>
              ))}
              <button type="button" className={`${chip(false)} border-dashed !text-[#E40043] !border-[#E40043]`} onClick={() => setQuickAdd({ kind: 'colour', name: '' })}>+ Add colour</button>
            </div>
          </div>
          <div>
            <div className="text-sm font-medium text-slate-700 mb-2">Sizes *</div>
            <div className="flex flex-wrap gap-2">
              {sizes.map(s => (
                <button type="button" key={s._id} className={chip(sizeIds.includes(s._id))} onClick={() => toggle(sizeIds, setSizeIds, s._id)}>{s.name}</button>
              ))}
              <button type="button" className={`${chip(false)} border-dashed !text-[#E40043] !border-[#E40043]`} onClick={() => setQuickAdd({ kind: 'size', name: '' })}>+ Add size</button>
            </div>
          </div>
          <div className="text-xs text-slate-500">{colourIds.length * sizeIds.length} variant(s) will exist for this design.</div>
        </Card>

        <Card className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center border-b border-[var(--color-border)] pb-2 mb-2">
            <div>
              <h3 className="font-semibold text-lg">Bill of Materials (BOM)</h3>
              <p className="text-xs text-muted">Material for ONE garment, in the material's base unit. Saving a changed BOM creates a new version; old versions are kept.</p>
            </div>
            <Button type="button" variant="outline" onClick={() => setBomItems(prev => [...prev, emptyLine()])} className="w-full sm:w-auto shrink-0">
              <Plus size={16} /> Add Material
            </Button>
          </div>
          {materials.length === 0 && <p className="text-xs text-orange-600">No material variants found. Add materials (with colours) in Masters first.</p>}

          <datalist id="bom-roles">{ROLE_SUGGESTIONS.map(r => <option key={r} value={r} />)}</datalist>

          {/* Mobile Card View */}
          <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
            {bomItems.map((item, index) => (
              <div key={item.key} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-sm">Material {index + 1}</span>
                  <button type="button" onClick={() => removeBOMItem(item.key)} className="icon-btn text-red-500 hover:bg-red-50" aria-label="Remove material">
                    <Trash2 size={18} />
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted">Raw Material</label>
                  {materialField(item)}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">Qty / garment {uomOf(item.materialVariantId) && `(${uomOf(item.materialVariantId)})`}</label>
                    <input type="number" inputMode="decimal" min="0" step="0.001" className="input-field w-full" value={item.qtyPerGarmentBase === 0 ? '' : item.qtyPerGarmentBase} onChange={(e) => handleBOMChange(item.key, 'qtyPerGarmentBase', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">Allowance %</label>
                    <input type="number" inputMode="decimal" min="0" step="0.1" className="input-field w-full" value={item.allowancePct} onChange={(e) => handleBOMChange(item.key, 'allowancePct', parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted">Role</label>
                    <input list="bom-roles" className="input-field w-full" value={item.role} onChange={(e) => handleBOMChange(item.key, 'role', e.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]">
                  <th className="p-2 text-sm font-semibold text-muted w-[45%]">Raw Material</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[18%]">Qty per Garment</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[12%]">Allowance %</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[20%]">Role</th>
                  <th className="p-2 text-sm font-semibold text-muted w-[5%]"></th>
                </tr>
              </thead>
              <tbody>
                {bomItems.map((item) => (
                  <tr key={item.key} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="p-2">
                      {materialField(item)}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        <input type="number" inputMode="decimal" min="0" step="0.001" className="input-field w-full" value={item.qtyPerGarmentBase === 0 ? '' : item.qtyPerGarmentBase} onChange={(e) => handleBOMChange(item.key, 'qtyPerGarmentBase', parseFloat(e.target.value) || 0)} />
                        <span className="text-xs text-muted w-8">{uomOf(item.materialVariantId)}</span>
                      </div>
                    </td>
                    <td className="p-2">
                      <input type="number" inputMode="decimal" min="0" step="0.1" className="input-field w-full" value={item.allowancePct} onChange={(e) => handleBOMChange(item.key, 'allowancePct', parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="p-2">
                      <input list="bom-roles" className="input-field w-full" value={item.role} onChange={(e) => handleBOMChange(item.key, 'role', e.target.value)} />
                    </td>
                    <td className="p-2 text-center">
                      <button type="button" onClick={() => removeBOMItem(item.key)} className="icon-btn text-red-500 hover:bg-red-50" aria-label="Remove material">
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {saveError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{saveError}</div>}

        <div className="grid grid-cols-[1fr_2fr] sm:flex sm:flex-row sm:justify-end gap-3 sticky bottom-0 z-10 bg-[var(--color-background)]/95 backdrop-blur p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t border-[var(--color-border)] -mx-4 px-4 md:-mx-6 md:px-6">
          <Button type="button" variant="secondary" onClick={() => navigate(isEditing ? `/production/designs/${id}` : '/production/designs')} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button type="submit" isLoading={isSaving} className="w-full sm:w-auto">
            Save Design & BOM
          </Button>
        </div>
      </form>

      <PickerSheet
        open={picker?.kind === 'category'}
        title="Choose product category"
        items={categories.filter(c => c.isActive !== false || c._id === formData.productCategoryId).map((c): PickerItem => ({ id: c._id, title: c.name }))}
        selectedId={formData.productCategoryId}
        searchPlaceholder="Search category…"
        emptyText="No product category found."
        onSelect={it => { setFormData(prev => ({ ...prev, productCategoryId: it.id })); setPicker(null); }}
        onClose={() => setPicker(null)}
        createLabel="category"
        onCreate={q => { setPicker(null); setQuickAdd({ kind: 'category', name: q }); }}
      />
      <PickerSheet
        open={picker?.kind === 'material'}
        title="Choose raw material"
        items={materials.map((m): PickerItem => ({
          id: m.materialVariantId,
          title: m.name,
          subtitle: m.uom ? `Unit ${m.uom}` : undefined,
          meta: `${fmtQty(m.mainWhOnHand)} ${m.uom ?? ''}`.trim(),
        }))}
        selectedId={picker?.kind === 'material' ? bomItems.find(b => b.key === picker.key)?.materialVariantId : undefined}
        searchPlaceholder="Search material or colour…"
        emptyText="No material found. Materials get colours when they are purchased (or under Inventory → Materials)."
        onSelect={it => { if (picker?.kind === 'material') handleBOMChange(picker.key, 'materialVariantId', it.id); setPicker(null); }}
        onClose={() => setPicker(null)}
      />
      <QuickAddMasterSheet
        open={quickAdd !== null}
        noun={quickAdd?.kind === 'category' ? 'product category' : quickAdd?.kind ?? 'item'}
        endpoint={quickAdd?.kind === 'category' ? '/product-categories' : quickAdd?.kind === 'size' ? '/sizes' : '/colours'}
        initialName={quickAdd?.name ?? ''}
        namePlaceholder={quickAdd?.kind === 'category' ? 'e.g. Kurti Set' : quickAdd?.kind === 'size' ? 'e.g. XL' : 'e.g. Navy Blue'}
        onClose={() => setQuickAdd(null)}
        onCreated={r => {
          const rec = { ...r, isActive: true } as unknown as NamedRecord;
          if (quickAdd?.kind === 'category') { setCategories(prev => [...prev, rec]); setFormData(prev => ({ ...prev, productCategoryId: r._id })); }
          else if (quickAdd?.kind === 'size') { setSizes(prev => [...prev, rec]); setSizeIds(prev => [...prev, r._id]); }
          else { setColours(prev => [...prev, rec]); setColourIds(prev => [...prev, r._id]); }
          setQuickAdd(null);
        }}
      />
    </div>
  );
}
