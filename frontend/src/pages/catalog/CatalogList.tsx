import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ImageOff, AlertTriangle, MessageCircle } from 'lucide-react';
import { catalogApi, CATALOG_TAGS, type CatalogItem } from '../../lib/api/catalog';
import { settingsApi } from '../../lib/api/settings';
import { apiErrorMessage } from '../../lib/api/insights';
import { WhatsAppShareDialog } from '../../components/feedback/WhatsAppShareDialog';
import { Can, RestrictedValue } from '../../lib/permissions/Can';
import { usePermission } from '../../lib/permissions/usePermission';
import { EmptyState, STAGGER_CHILDREN } from '../pageKit';

function inr(n?: number | null) {
  return '₹' + (n ?? 0).toLocaleString('en-IN');
}

export function CatalogList() {
  const navigate = useNavigate();
  const { has } = usePermission();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [tag, setTag] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [shareItem, setShareItem] = useState<CatalogItem | null>(null);

  useEffect(() => {
    settingsApi.getCompany().then(c => setCompanyName(c?.legalName ?? '')).catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    catalogApi.list({ q: debounced || undefined, tag: tag || undefined, includeInactive: showInactive || undefined })
      .then(rows => { if (active) setItems(rows); })
      .catch(err => { if (active) setError(apiErrorMessage(err, 'Could not load the catalog.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [debounced, tag, showInactive]);

  const shareText = (d: CatalogItem) => [
    `Check out ${d.designNameOrNumber}${companyName ? ` from ${companyName}` : ''}!`,
    '',
    has('designs.rate.view') && d.salesPrice !== undefined ? `Price: ${inr(d.salesPrice)}` : '',
    `Tag: ${d.tag}`,
    d.description ?? '',
    d.sizes.length ? `Sizes: ${d.sizes.join(', ')}` : '',
    d.colours.length ? `Colours: ${d.colours.join(', ')}` : '',
    d.minOrderQty ? `Minimum order: ${d.minOrderQty} pcs` : '',
    d.photoUrls[0] ?? '',
  ].filter((line, i) => line || i === 1).join('\n');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Design Catalog</h1>
          <p className="text-sm text-slate-500">Every sellable design with its photo, price, sizes and live ready stock.</p>
        </div>
        <Can perm={['designs.edit', 'designs.rate.view']}>
          <button
            onClick={() => navigate('/catalog/new')}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 md:py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]"
          >
            <Plus size={16} /> Add New Design
          </button>
        </Can>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:flex-wrap">
        <input
          type="text"
          placeholder="Search by design name, number, HSN..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:max-w-sm px-3 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]"
        />
        <select value={tag} onChange={e => setTag(e.target.value)} className="w-full sm:w-auto px-3 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg bg-white">
          <option value="">All tags</option>
          {CATALOG_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 py-2">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden animate-pulse">
              <div className="h-40 bg-slate-100" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState message={debounced || tag ? 'No designs match your filters.' : 'No designs in the catalog yet.'} />
      ) : (
        <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
          {items.map(d => (
            <div key={d._id} className={`bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${d.isActive ? '' : 'opacity-60'}`}>
              <button onClick={() => navigate(`/catalog/${d._id}`)} className="pressable text-left w-full">
                <div className="h-40 bg-slate-100 flex items-center justify-center relative">
                  {d.photoUrls[0] ? (
                    <img src={d.photoUrls[0]} alt={d.designNameOrNumber} className="w-full h-full object-cover" />
                  ) : (
                    <ImageOff size={28} className="text-slate-300" />
                  )}
                  {d.outOfStock ? (
                    <span className="absolute top-2 right-2 flex items-center gap-1 bg-red-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      <AlertTriangle size={10} /> Out of stock
                    </span>
                  ) : d.lowStock ? (
                    <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">Low stock</span>
                  ) : null}
                  {!d.isActive && <span className="absolute top-2 left-2 bg-slate-700 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                <div className="p-3 pb-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">{d.designNameOrNumber}</div>
                  <div className="flex flex-wrap items-center justify-between gap-1 mt-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FFDCE5] text-[#B80037] font-medium max-w-full truncate">{d.tag}</span>
                    <span className="text-sm font-bold text-slate-900">
                      <RestrictedValue perm="designs.rate.view">{d.salesPrice !== undefined ? inr(d.salesPrice) : ''}</RestrictedValue>
                    </span>
                  </div>
                  {d.readyStockQty !== null && (
                    <div className="text-xs text-slate-500 mt-1">{d.readyStockQty.toLocaleString('en-IN')} pcs ready</div>
                  )}
                </div>
              </button>
              <button
                onClick={() => setShareItem(d)}
                className="w-full flex items-center justify-center gap-1.5 px-2 sm:px-3 py-2.5 md:py-2 text-xs font-medium text-green-700 border-t border-slate-100 hover:bg-green-50"
              >
                <MessageCircle size={13} /> Send on WhatsApp
              </button>
            </div>
          ))}
        </div>
      )}

      <WhatsAppShareDialog
        open={!!shareItem}
        title="Send Design on WhatsApp"
        message={shareItem ? shareText(shareItem) : ''}
        onClose={() => setShareItem(null)}
      />
    </div>
  );
}
