import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, QrCode, Download, Droplet, Share2, Trash2 } from 'lucide-react';
import { catalogApi, listDesignOptions, CATALOG_TAGS, type CatalogItem, type CatalogPayload, type CatalogTag, type DesignOption } from '../../lib/api/catalog';
import { settingsApi } from '../../lib/api/settings';
import { apiErrorMessage } from '../../lib/api/insights';
import { apiClient } from '../../lib/api/client';
import { renderWatermarkedImage, dataUrlToFile } from '../../lib/watermark/watermark';
import { usePermission } from '../../lib/permissions/usePermission';

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

interface FormState {
  designId: string;
  designNameOrNumber: string;
  salesPrice: string;
  defaultPrice: string;
  tag: CatalogTag;
  description: string;
  samplePrice: string;
  designRecipe: string;
  sizes: string[];
  colours: string[];
  hsnCode: string;
  gstPct: string;
  minStockQty: string;
  minOrderQty: string;
  outOfStock: boolean;
}

const EMPTY: FormState = {
  designId: '', designNameOrNumber: '', salesPrice: '', defaultPrice: '', tag: 'Ready to Wear', description: '', samplePrice: '',
  designRecipe: '', sizes: [], colours: [], hsnCode: '', gstPct: '', minStockQty: '', minOrderQty: '', outOfStock: false,
};

function toForm(d: CatalogItem): FormState {
  const s = (n?: number) => (n !== undefined && n !== null ? String(n) : '');
  return {
    designId: d.designId ?? '', designNameOrNumber: d.designNameOrNumber, salesPrice: s(d.salesPrice), defaultPrice: s(d.defaultPrice),
    tag: d.tag, description: d.description ?? '', samplePrice: s(d.samplePrice), designRecipe: d.designRecipe ?? '', sizes: d.sizes ?? [],
    colours: d.colours ?? [], hsnCode: d.hsnCode ?? '', gstPct: s(d.gstPct), minStockQty: s(d.minStockQty), minOrderQty: s(d.minOrderQty),
    outOfStock: d.outOfStock && d.readyStockQty !== 0 ? d.outOfStock : false,
  };
}

export function CatalogForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  const { has } = usePermission();
  const canEdit = has('designs.edit') && has('designs.rate.view');

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [item, setItem] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [designs, setDesigns] = useState<DesignOption[]>([]);
  const [sizeOptions, setSizeOptions] = useState<string[]>(DEFAULT_SIZES);
  const [colourOptions, setColourOptions] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState('');

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoMsg, setPhotoMsg] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [watermarkOn, setWatermarkOn] = useState(false);
  const [watermarkText, setWatermarkText] = useState('');
  const [watermarkedPreview, setWatermarkedPreview] = useState('');
  const [watermarking, setWatermarking] = useState(false);

  useEffect(() => {
    settingsApi.getCompany().then(c => { setCompanyName(c?.legalName ?? ''); setWatermarkText(t => t || (c?.legalName ?? '')); }).catch(() => undefined);
    listDesignOptions().then(setDesigns).catch(() => setDesigns([]));
    apiClient.get<Array<{ name: string; sortOrder?: number; isActive?: boolean }>>('/sizes')
      .then(r => { const list = r.data.filter(s => s.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(s => s.name); if (list.length) setSizeOptions(list); })
      .catch(() => undefined);
    apiClient.get<Array<{ name: string; isActive?: boolean }>>('/colours')
      .then(r => setColourOptions(r.data.filter(c => c.isActive !== false).map(c => c.name)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isEditing || !id) return;
    catalogApi.get(id)
      .then(d => { setItem(d); setForm(toForm(d)); })
      .catch(err => setSaveError(apiErrorMessage(err, 'Could not load this catalog entry.')))
      .finally(() => setIsLoading(false));
  }, [isEditing, id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));
  const toggleIn = (k: 'sizes' | 'colours', v: string) =>
    setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }));

  const linkDesign = (designId: string) => {
    const d = designs.find(x => x._id === designId);
    setForm(f => ({
      ...f,
      designId,
      designNameOrNumber: f.designNameOrNumber || (d ? d.designNo : ''),
      hsnCode: f.hsnCode || d?.hsn || '',
      salesPrice: f.salesPrice || (d?.defaultSellingRate ? String(d.defaultSellingRate) : ''),
      defaultPrice: f.defaultPrice || (d?.defaultSellingRate ? String(d.defaultSellingRate) : ''),
      description: f.description || d?.description || '',
    }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.designNameOrNumber.trim()) errs.designNameOrNumber = 'Design name / number is required.';
    if (!form.salesPrice || Number(form.salesPrice) <= 0) errs.salesPrice = 'Sales price is required.';
    if (!form.defaultPrice || Number(form.defaultPrice) <= 0) errs.defaultPrice = 'Default price is required.';
    if (form.gstPct && (Number(form.gstPct) < 0 || Number(form.gstPct) > 100)) errs.gstPct = 'GST % must be 0–100.';
    return errs;
  };

  const buildPayload = (): CatalogPayload => {
    const num = (v: string) => (v === '' ? undefined : Number(v));
    return {
      designId: form.designId || (isEditing ? null : undefined),
      designNameOrNumber: form.designNameOrNumber.trim(),
      salesPrice: Number(form.salesPrice),
      defaultPrice: Number(form.defaultPrice),
      tag: form.tag,
      description: form.description,
      samplePrice: num(form.samplePrice),
      designRecipe: form.designRecipe,
      sizes: form.sizes,
      colours: form.colours,
      hsnCode: form.hsnCode,
      gstPct: num(form.gstPct),
      minStockQty: num(form.minStockQty),
      minOrderQty: num(form.minOrderQty),
      outOfStock: form.outOfStock,
    };
  };

  const uploadPhoto = async (targetId: string): Promise<boolean> => {
    if (!photoFile) return true;
    const file = watermarkOn && watermarkedPreview ? await dataUrlToFile(watermarkedPreview, `${form.designNameOrNumber || 'design'}.png`) : photoFile;
    setIsUploading(true);
    try {
      const updated = await catalogApi.uploadPhoto(targetId, file);
      setItem(updated);
      setPhotoFile(null);
      setPhotoUrl('');
      return true;
    } catch (err) {
      setPhotoMsg(`Saved, but the photo could not be uploaded: ${apiErrorMessage(err, 'upload failed')}`);
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setIsSaving(true);
    setSaveError('');
    setPhotoMsg('');
    try {
      const saved = isEditing && id
        ? await catalogApi.update(id, buildPayload(), item?.version)
        : await catalogApi.create(buildPayload());
      const ok = await uploadPhoto(saved._id);
      if (ok) navigate('/catalog');
      else if (!isEditing) navigate(`/catalog/${saved._id}`, { replace: true });
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not save this design.'));
    } finally {
      setIsSaving(false);
    }
  };

  const removePhoto = async (url: string) => {
    if (!id) return;
    try {
      setItem(await catalogApi.removePhoto(id, url));
    } catch (err) {
      setPhotoMsg(apiErrorMessage(err, 'Could not remove the photo.'));
    }
  };

  const toggleActive = async () => {
    if (!id || !item) return;
    try {
      const updated = await catalogApi.setActive(id, !item.isActive);
      setItem(updated);
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not change the status.'));
    }
  };

  const qrValue = encodeURIComponent(form.designNameOrNumber || id || 'new-design');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrValue}`;

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  }

  const inputClass = 'w-full px-3 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043] disabled:bg-slate-50';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';
  const sectionClass = 'bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5 flex flex-col gap-4';
  const previewSrc = watermarkOn && watermarkedPreview ? watermarkedPreview : photoUrl;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-2 md:gap-3">
        <button onClick={() => navigate('/catalog')} className="shrink-0 flex items-center justify-center w-10 h-10 -ml-2 md:ml-0 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">{isEditing ? 'Edit Design' : 'Add New Design'}</h1>
          <p className="text-sm text-slate-500">Only design name/number, sales price, tag, and default price are required — everything else is optional.</p>
        </div>
        {isEditing && item && canEdit && (
          <button type="button" onClick={toggleActive} className="shrink-0 px-3 py-2 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            {item.isActive ? 'Deactivate' : 'Reactivate'}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm text-slate-600">View only — editing the catalog needs design edit and design rate permissions.</div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <fieldset disabled={!canEdit} className="flex flex-col gap-4">
          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Required</h2>

            {item && item.photoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.photoUrls.map(u => (
                  <div key={u} className="relative">
                    <img src={u} alt="Design" className="w-24 h-24 object-cover rounded-lg border border-slate-200" />
                    {canEdit && (
                      <button type="button" onClick={() => removePhoto(u)} className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-white border border-slate-200 text-red-600 flex items-center justify-center" aria-label="Remove photo">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div>
              <label className={labelClass}>Photo</label>
              <label className="flex items-center gap-2 w-full min-w-0 px-3 py-3 md:py-2 text-sm border border-dashed border-slate-300 rounded-lg cursor-pointer text-slate-500 hover:bg-slate-50">
                <Upload size={14} />
                <span className="truncate">{photoFile?.name || 'Upload a photo (optional) — saved with the design'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => {
                  const file = e.target.files?.[0] ?? null;
                  setPhotoFile(file);
                  setWatermarkedPreview('');
                  setPhotoUrl(file ? URL.createObjectURL(file) : '');
                }} />
              </label>
              {photoMsg && <p className="text-xs text-red-600 mt-1">{photoMsg}</p>}
            </div>

            {photoUrl && (
              <div className="flex flex-col gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={watermarkOn} onChange={e => { setWatermarkOn(e.target.checked); setWatermarkedPreview(''); }} />
                  <Droplet size={14} className="text-[#E40043]" /> Add watermark (the watermarked image is what gets saved)
                </label>
                {watermarkOn && (
                  <>
                    <div>
                      <label className={labelClass}>Watermark Text</label>
                      <input className={inputClass} value={watermarkText} onChange={e => { setWatermarkText(e.target.value); setWatermarkedPreview(''); }} placeholder="Company name" />
                    </div>
                    <button
                      type="button"
                      disabled={watermarking}
                      onClick={async () => {
                        setWatermarking(true);
                        try { setWatermarkedPreview(await renderWatermarkedImage(photoUrl, watermarkText || companyName)); }
                        finally { setWatermarking(false); }
                      }}
                      className="self-start flex items-center gap-2 px-3 py-2.5 md:py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-white text-slate-700 disabled:opacity-60"
                    >
                      <Droplet size={14} /> {watermarking ? 'Applying…' : 'Preview Watermark'}
                    </button>
                  </>
                )}
                <img src={previewSrc} alt="Preview" className="max-h-56 max-w-full rounded-lg border border-slate-200 self-start" />
                {watermarkOn && watermarkedPreview && (
                  <div className="flex items-center gap-3">
                    <a href={watermarkedPreview} download={`${form.designNameOrNumber || 'design'}-watermarked.png`}
                      className="flex items-center gap-1 py-2 text-sm text-[#E40043] hover:text-[#8F002B] font-medium">
                      <Download size={14} /> Download
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        const file = await dataUrlToFile(watermarkedPreview, `${form.designNameOrNumber || 'design'}.png`);
                        if (navigator.canShare?.({ files: [file] })) {
                          await navigator.share({ files: [file], title: form.designNameOrNumber, text: `${form.designNameOrNumber}${companyName ? ` — ${companyName}` : ''}` });
                        } else {
                          alert('Direct image sharing isn\'t supported on this browser/device — use Download, then attach the file manually.');
                        }
                      }}
                      className="flex items-center gap-1 py-2 text-sm text-green-700 hover:text-green-900 font-medium"
                    >
                      <Share2 size={14} /> Share
                    </button>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className={labelClass}>Linked Production Design (optional)</label>
              <select className={inputClass} value={form.designId} onChange={e => (e.target.value ? linkDesign(e.target.value) : set('designId', ''))}>
                <option value="">Not linked</option>
                {designs.map(d => <option key={d._id} value={d._id}>{d.designNo} — {d.name}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                Linking shows live ready stock here and raises a low-stock alert below the minimum stock quantity.
                {item?.readyStockQty !== null && item?.readyStockQty !== undefined && <> Currently <span className="font-medium text-slate-600">{item.readyStockQty} pcs</span> ready.</>}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Design Name / Number *</label>
                <input className={inputClass} value={form.designNameOrNumber} onChange={e => set('designNameOrNumber', e.target.value)} placeholder="e.g. DR-1024 — Summer Floral Dress" />
                {errors.designNameOrNumber && <span className="text-xs text-red-500">{errors.designNameOrNumber}</span>}
              </div>
              <div>
                <label className={labelClass}>Tag *</label>
                <select className={inputClass} value={form.tag} onChange={e => set('tag', e.target.value as CatalogTag)}>
                  {CATALOG_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Sales Price (₹) *</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.salesPrice} onChange={e => set('salesPrice', e.target.value)} placeholder="0" />
                {errors.salesPrice && <span className="text-xs text-red-500">{errors.salesPrice}</span>}
              </div>
              <div>
                <label className={labelClass}>Default Price (₹) *</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.defaultPrice} onChange={e => set('defaultPrice', e.target.value)} placeholder="0" />
                {errors.defaultPrice && <span className="text-xs text-red-500">{errors.defaultPrice}</span>}
              </div>
            </div>
          </div>

          <div className={sectionClass}>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Optional Details</h2>
            <div>
              <label className={labelClass}>Description</label>
              <textarea className={inputClass} rows={2} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Fabric, fit, occasion, etc." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Sample Design Price (₹)</label>
                <input type="number" min="0" step="0.01" inputMode="decimal" className={inputClass} value={form.samplePrice} onChange={e => set('samplePrice', e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className={labelClass}>Design Recipe</label>
                <input className={inputClass} value={form.designRecipe} onChange={e => set('designRecipe', e.target.value)} placeholder="Link or reference to BOM/recipe" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Sizes</label>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set([...sizeOptions, ...form.sizes])).map(s => (
                  <button type="button" key={s} onClick={() => toggleIn('sizes', s)}
                    className={`min-w-11 px-3 py-2.5 md:py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.sizes.includes(s) ? 'border-[#E40043] bg-[#FFF0F3] text-[#B80037]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            {(colourOptions.length > 0 || form.colours.length > 0) && (
              <div>
                <label className={labelClass}>Colours</label>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...colourOptions, ...form.colours])).map(c => (
                    <button type="button" key={c} onClick={() => toggleIn('colours', c)}
                      className={`px-3 py-2.5 md:py-1.5 rounded-lg text-sm font-medium border transition-colors ${form.colours.includes(c) ? 'border-[#E40043] bg-[#FFF0F3] text-[#B80037]' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>HSN Code</label>
                <input className={inputClass} value={form.hsnCode} onChange={e => set('hsnCode', e.target.value)} placeholder="e.g. 62044200" />
              </div>
              <div>
                <label className={labelClass}>GST %</label>
                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" className={inputClass} value={form.gstPct} onChange={e => set('gstPct', e.target.value)} placeholder="e.g. 5" />
                {errors.gstPct && <span className="text-xs text-red-500">{errors.gstPct}</span>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Minimum Stock Quantity</label>
                <input type="number" min="0" inputMode="numeric" className={inputClass} value={form.minStockQty} onChange={e => set('minStockQty', e.target.value)} placeholder="At or below this = low stock alert" />
              </div>
              <div>
                <label className={labelClass}>Minimum Order Quantity</label>
                <input type="number" min="0" inputMode="numeric" className={inputClass} value={form.minOrderQty} onChange={e => set('minOrderQty', e.target.value)} placeholder="Smallest order-able qty" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.outOfStock} onChange={e => set('outOfStock', e.target.checked)} />
              Mark as out of stock in store{form.designId ? ' (also shown automatically when linked stock is 0)' : ''}
            </label>
          </div>
        </fieldset>

        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">QR Code</h2>
          <p className="text-xs text-slate-500">A QR code that encodes this design's name/number, for printing on tags or catalogs.</p>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setShowQr(true)} className="flex items-center gap-2 px-4 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700">
              <QrCode size={15} /> Generate QR Code
            </button>
            {showQr && (
              <div className="flex items-center gap-3">
                <img src={qrUrl} alt="Design QR code" className="w-20 h-20 border border-slate-200 rounded-lg" />
                <a href={qrUrl} download={`${form.designNameOrNumber || 'design'}-qr.png`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-[#E40043] hover:text-[#8F002B] font-medium">
                  <Download size={14} /> Download
                </a>
              </div>
            )}
          </div>
        </div>

        {saveError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{saveError}</div>}

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
          {canEdit && (
            <button type="submit" disabled={isSaving || isUploading} className="w-full sm:w-auto px-6 py-2.5 md:py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
              {isSaving ? (isUploading ? 'Uploading photo…' : 'Saving…') : isEditing ? 'Update Design' : 'Save Design'}
            </button>
          )}
          <button type="button" onClick={() => navigate('/catalog')} className="w-full sm:w-auto px-6 py-2.5 md:py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 text-sm">
            {canEdit ? 'Cancel' : 'Back'}
          </button>
        </div>
      </form>
    </div>
  );
}
