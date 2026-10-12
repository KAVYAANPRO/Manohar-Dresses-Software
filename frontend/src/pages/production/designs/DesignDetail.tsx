import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit, AlertTriangle, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import {
  designsApi, lookupsApi, toProblem, fmtDate, fmtQty,
  type DesignRecord, type DesignVariantRecord, type BomVersionRecord, type RequirementResult, type NamedRecord,
} from '../../../lib/api/production';
import { formatINR } from '../../../lib/format/money';
import { STAGGER_CHILDREN, TabUnderline } from '../../pageKit';

const TABS = ['Overview', 'Variants', 'BOM', 'Instructions'] as const;
type Tab = typeof TABS[number];

function stockStatus(shortfall: number, available: number) {
  if (shortfall <= 0) return { label: 'Available', cls: 'text-green-600', icon: <CheckCircle size={14} /> };
  if (available > 0) return { label: 'Shortfall', cls: 'text-orange-600', icon: <AlertTriangle size={14} /> };
  return { label: 'Out of Stock', cls: 'text-red-600', icon: <XCircle size={14} /> };
}

export function DesignDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [design, setDesign] = useState<DesignRecord | null>(null);
  const [category, setCategory] = useState('');
  const [colours, setColours] = useState<NamedRecord[]>([]);
  const [sizes, setSizes] = useState<NamedRecord[]>([]);
  const [variants, setVariants] = useState<DesignVariantRecord[]>([]);
  const [bom, setBom] = useState<BomVersionRecord | null>(null);
  const [bomHistory, setBomHistory] = useState<BomVersionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [planQty, setPlanQty] = useState(100);
  const [req, setReq] = useState<RequirementResult | null>(null);
  const [reqError, setReqError] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      designsApi.get(id),
      designsApi.variants(id),
      designsApi.bom(id),
      designsApi.bomHistory(id).catch(() => []),
      lookupsApi.productCategories().catch(() => []),
      lookupsApi.colours().catch(() => []),
      lookupsApi.sizes().catch(() => []),
    ])
      .then(([d, v, b, h, cats, cols, szs]) => {
        setDesign(d);
        setVariants(v);
        setBom(b);
        setBomHistory(h);
        setCategory(cats.find(c => c._id === d.productCategoryId)?.name ?? '—');
        setColours(cols);
        setSizes(szs);
      })
      .catch(err => setLoadError(toProblem(err, 'Could not load this design.').detail))
      .finally(() => setIsLoading(false));
  }, [id]);

  // Live requirement for the planning qty (garments x BOM x (1 + allowance) vs MAIN-WH stock).
  useEffect(() => {
    if (!id || !bom || planQty <= 0) { setReq(null); return; }
    const t = setTimeout(() => {
      designsApi.requirements(id, planQty)
        .then(r => { setReq(r); setReqError(''); })
        .catch(err => setReqError(toProblem(err).detail));
    }, 300);
    return () => clearTimeout(t);
  }, [id, bom, planQty]);

  const regenerate = async () => {
    if (!id) return;
    setRegenerating(true);
    try { setVariants(await designsApi.regenerateVariants(id)); }
    catch (err) { setLoadError(toProblem(err).detail); }
    finally { setRegenerating(false); }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!design) return <div className="p-6 text-slate-500">{loadError || 'Design not found.'}</div>;

  const colourNames = design.colourOptions.map(cid => colours.find(c => c._id === String(cid))?.name ?? '?');
  const sizeNames = design.sizeOptions.map(sid => sizes.find(s => s._id === String(sid))?.name ?? '?');
  const status = design.isActive ? 'Active' : 'Inactive';
  const sku = (v: DesignVariantRecord) => `${design.designNo}-${(v.colourId?.name ?? '').replace(/\s+/g, '').slice(0, 4).toUpperCase()}-${v.sizeId?.name ?? ''}`;
  const reqByLine = new Map((req?.lines ?? []).map(l => [l.bomLineId, l]));
  const reqByMaterial = new Map((req?.byMaterial ?? []).map(m => [m.materialVariantId, m]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/production/designs')} className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors mt-0.5">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Design {design.designNo}</h1>
            <span className="font-mono text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{design.designNo}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${design.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{status}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{category} · {design.productType || '—'} · {variants.length} variants</p>
        </div>
        <Button onClick={() => navigate(`/production/designs/${id}/edit`)} variant="secondary">
          <Edit size={15} /> Edit
        </Button>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'relative px-4 py-2.5 min-h-[44px] text-sm whitespace-nowrap shrink-0 font-medium transition-colors border-b-2 -mb-px',
              activeTab === tab ? 'border-transparent text-[#E40043]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            ].join(' ')}
          >
            {activeTab === tab && <TabUnderline group="design" />}
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3">
            <h3 className="font-semibold text-sm uppercase tracking-wide text-slate-500">Design Info</h3>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              {[
                ['Design No.', design.designNo],
                ['Category', category],
                ['Type', design.productType || '—'],
                ['Status', status],
                ['Selling Rate', design.defaultSellingRate != null ? formatINR(design.defaultSellingRate) : '—'],
                ['HSN', design.hsn || '—'],
                ['Expected Qty', design.expectedProductionQty != null ? String(design.expectedProductionQty) : '—'],
                ['Updated', fmtDate(design.updatedAt)],
              ].map(([label, val]) => (
                <div key={label}>
                  <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                  <div className="font-medium text-slate-800">{val}</div>
                </div>
              ))}
            </div>
            {design.description && (
              <div className="border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400 mb-1">Description</div>
                <p className="text-sm text-slate-700">{design.description}</p>
              </div>
            )}
            {design.imageUrls?.length > 0 && (
              <div className="border-t border-slate-100 pt-3 flex gap-2 overflow-x-auto">
                {design.imageUrls.map(u => <img key={u} src={u} alt={design.designNo} className="h-24 w-24 object-cover rounded-lg shrink-0" />)}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Colours</div>
              <div className="flex flex-wrap gap-2">
                {colourNames.map((c, i) => <span key={i} className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-sm font-medium">{c}</span>)}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Sizes</div>
              <div className="flex flex-wrap gap-2">
                {sizeNames.map((s, i) => <span key={i} className="min-w-10 h-10 px-2 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold flex items-center justify-center">{s}</span>)}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Variants' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
            <p className="text-sm text-slate-500">Each variant is a <span className="font-medium">Design / Colour / Size</span> combination, generated from the design's options. Add colours or sizes via Edit.</p>
            <Button variant="outline" onClick={regenerate} isLoading={regenerating} className="w-full sm:w-auto shrink-0">
              <RefreshCw size={15} /> Sync Variants
            </Button>
          </div>
          {variants.length === 0 && <div className="p-6 text-center text-sm text-slate-400 border border-dashed rounded-lg">No variants yet.</div>}
          <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
            {variants.map(v => (
              <div key={v._id} className="flex flex-col gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <span className="font-mono text-xs text-slate-700 break-all">{sku(v)}</span>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs font-medium text-muted">Colour</div><div className="text-slate-800">{v.colourId?.name}</div></div>
                  <div><div className="text-xs font-medium text-muted">Size</div><div className="font-semibold text-slate-800">{v.sizeId?.name}</div></div>
                  <div><div className="text-xs font-medium text-muted">Status</div><div className="text-slate-700">{v.isActive ? 'Active' : 'Inactive'}</div></div>
                </div>
              </div>
            ))}
          </div>
          {variants.length > 0 && (
            <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
              <table className="w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['SKU', 'Colour', 'Size', 'Status'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {variants.map(v => (
                    <tr key={v._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{sku(v)}</td>
                      <td className="px-4 py-3 text-slate-800">{v.colourId?.name}</td>
                      <td className="px-4 py-3"><span className="min-w-8 h-8 px-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold inline-flex items-center justify-center">{v.sizeId?.name}</span></td>
                      <td className="px-4 py-3 text-slate-600">{v.isActive ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'BOM' && (
        <div className="flex flex-col gap-5">
          {!bom ? (
            <div className="p-6 text-center text-sm text-slate-500 border border-dashed rounded-lg flex flex-col items-center gap-3">
              No BOM yet. Job slips for this design are not stock-checked until a BOM exists.
              <Button variant="outline" onClick={() => navigate(`/production/designs/${id}/edit`)}>Add BOM</Button>
            </div>
          ) : (
            <>
              <div className="bg-[#FFF0F3] border border-[#FFB8CA] rounded-xl px-4 md:px-5 py-4 flex items-center gap-3 flex-wrap">
                <div className="text-sm font-medium text-[#8F002B]">Plan for</div>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={planQty}
                  onChange={e => setPlanQty(parseInt(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 text-sm border border-[#FF6F94] rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E40043]"
                />
                <div className="text-sm font-medium text-[#8F002B]">garments — live requirement vs main-warehouse stock</div>
                <div className="text-xs text-[#8F002B] w-full sm:w-auto sm:ml-auto">BOM v{bom.versionNo}{bomHistory.length > 1 ? ` (${bomHistory.length} versions)` : ''}</div>
              </div>
              {reqError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{reqError}</div>}

              <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
                {bom.lines.map(line => {
                  const r = reqByLine.get(line._id);
                  const m = reqByMaterial.get(String(line.materialVariantId));
                  const st = m ? stockStatus(m.shortfall, m.availableQtyBase) : null;
                  return (
                    <div key={line._id} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                      <div>
                        <div className="text-xs font-medium text-muted">{line.role}</div>
                        <div className="font-medium text-slate-900">{line.materialName}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><div className="text-xs font-medium text-muted">Qty / garment</div><div className="text-slate-700">{fmtQty(line.qtyPerGarmentBase)} {line.uom}</div></div>
                        <div><div className="text-xs font-medium text-muted">Allowance</div><div className="text-slate-700">{line.allowancePct}%</div></div>
                        <div><div className="text-xs font-medium text-muted">Required</div><div className="font-semibold text-slate-900">{r ? `${fmtQty(r.requiredQtyBase)} ${line.uom}` : '—'}</div></div>
                        <div><div className="text-xs font-medium text-muted">In warehouse</div><div className="text-slate-700">{fmtQty(m?.availableQtyBase ?? line.mainWhOnHand)} {line.uom}</div></div>
                      </div>
                      {st && m && (
                        <div className={`flex items-center flex-wrap gap-1 text-xs font-medium ${st.cls}`}>
                          {st.icon} {st.label}
                          {m.shortfall > 0 && <span className="ml-1 text-red-500">({fmtQty(m.shortfall)} {line.uom} short)</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Role', 'Material', 'Unit', 'Qty / garment', 'Allowance', 'Required', 'In warehouse', 'Status'].map(h => (
                        <th key={h} className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bom.lines.map(line => {
                      const r = reqByLine.get(line._id);
                      const m = reqByMaterial.get(String(line.materialVariantId));
                      const st = m ? stockStatus(m.shortfall, m.availableQtyBase) : null;
                      return (
                        <tr key={line._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="px-3 py-3 text-xs font-medium text-slate-500">{line.role}</td>
                          <td className="px-3 py-3 font-medium text-slate-900">{line.materialName}</td>
                          <td className="px-3 py-3 text-slate-600">{line.uom}</td>
                          <td className="px-3 py-3 text-slate-700">{fmtQty(line.qtyPerGarmentBase)}</td>
                          <td className="px-3 py-3 text-slate-500">{line.allowancePct}%</td>
                          <td className="px-3 py-3 font-semibold text-slate-900">{r ? `${fmtQty(r.requiredQtyBase)} ${line.uom}` : '—'}</td>
                          <td className="px-3 py-3 text-slate-700">{fmtQty(m?.availableQtyBase ?? line.mainWhOnHand)} {line.uom}</td>
                          <td className="px-3 py-3">
                            {st && m && (
                              <div className={`flex items-center gap-1 text-xs font-medium ${st.cls}`}>
                                {st.icon} {st.label}
                                {m.shortfall > 0 && <span className="ml-1 text-red-500">({fmtQty(m.shortfall)} {line.uom} short)</span>}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
                <p className="text-xs text-slate-400">Formula: garments × qty per garment × (1 + allowance%) = required. Same material on several lines is summed for the stock check.</p>
                <Button variant="outline" onClick={() => navigate(`/production/designs/${id}/edit`)} className="w-full sm:w-auto shrink-0">
                  <Edit size={15} /> Edit BOM
                </Button>
              </div>

              {bomHistory.length > 1 && (
                <div className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">BOM history</div>
                  <ul className="text-sm text-slate-600 flex flex-col gap-1">
                    {bomHistory.map(h => (
                      <li key={h._id}>v{h.versionNo} · {fmtDate(h.createdAt)} · {h.lines.length} line(s){h.isActive ? ' · current' : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'Instructions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6">
          <div className="flex justify-between items-start gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-slate-900">Manufacturing Instructions</h3>
              <p className="text-xs text-slate-400 mt-0.5">Notes sent with every job slip for this design.</p>
            </div>
            <Button variant="secondary" onClick={() => navigate(`/production/designs/${id}/edit`)}>
              <Edit size={14} /> Edit
            </Button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed font-sans">
            {design.manufacturingInstructions || 'No manufacturing instructions added yet.'}
          </pre>
        </div>
      )}
    </div>
  );
}
