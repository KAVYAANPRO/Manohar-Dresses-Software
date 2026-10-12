import { useState, useEffect } from 'react';
import { Package, ChevronDown } from 'lucide-react';
import { readyStockApi, apiErrorMessage, fmtDate, inr, type ReadyStockGroup, type ReadyStockLot } from '../../lib/api/sales';
import { ErrorBanner } from '../sales/shared';
import { EmptyState, STAGGER_CHILDREN, FilterPills } from '../pageKit';
import { Collapse } from '../../components/motion';

export function ReadyStockList() {
  const [items, setItems] = useState<ReadyStockGroup[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [open, setOpen] = useState<string | null>(null);
  const [lots, setLots] = useState<Record<string, ReadyStockLot[]>>({});

  useEffect(() => {
    Promise.all([readyStockApi.summary(), readyStockApi.categories().catch(() => [])])
      .then(([s, cats]) => {
        setItems(s);
        setCategories(Object.fromEntries(cats.map(c => [c._id, c.name])));
      })
      .catch(e => setError(apiErrorMessage(e, 'Could not load ready stock.')))
      .finally(() => setIsLoading(false));
  }, []);

  const keyOf = (e: ReadyStockGroup) => `${e.designId}:${e.colourId}`;
  const toggle = (e: ReadyStockGroup) => {
    const k = keyOf(e);
    setOpen(open === k ? null : k);
    if (!lots[k]) {
      readyStockApi.lots({ designId: e.designId, colourId: e.colourId })
        .then(l => setLots(p => ({ ...p, [k]: l })))
        .catch(err => setError(apiErrorMessage(err)));
    }
  };

  const catName = (id: string) => categories[id] ?? '—';
  const catOptions = ['All', ...Array.from(new Set(items.map(s => catName(s.categoryId))))];

  const q = search.toLowerCase();
  const filtered = items.filter(s =>
    (categoryFilter === 'All' || catName(s.categoryId) === categoryFilter) &&
    (s.designName.toLowerCase().includes(q) || s.designNo.toLowerCase().includes(q) || s.colourName.toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Ready Stock</h1>
        <p className="text-sm text-slate-500">Finished garments ready for sale. On Hand = total; Reserved = confirmed sales orders; ATP = available to promise.</p>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[200px] max-w-full sm:max-w-sm">
          <input type="text" placeholder="Search by design, no., or colour..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <FilterPills options={catOptions} value={categoryFilter} onChange={setCategoryFilter} className="basis-full sm:basis-auto" />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-4">{[1, 2].map(i => <div key={i} className="skeleton rounded-xl h-32" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState message={search || categoryFilter !== 'All' ? 'No ready stock matches your filters.' : 'No ready stock yet. It appears here once finished goods are received.'} />
      ) : (
        <div className={`flex flex-col gap-4 ${STAGGER_CHILDREN}`}>
          {filtered.map(entry => {
            const k = keyOf(entry);
            const totalATP = entry.sizes.reduce((s, r) => s + r.atp, 0);
            return (
              <div key={k} className="bg-white rounded-xl border border-slate-200 shadow-sm">
                <button onClick={() => toggle(entry)} className="w-full text-left active:bg-slate-50 transition-colors px-4 md:px-5 py-4 flex items-start justify-between gap-3 flex-wrap border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{entry.designNo}</span>
                      <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{entry.designNo}</span>
                      <span className="text-xs text-slate-500">/ {entry.colourName}</span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${open === k ? 'rotate-180' : ''}`} />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {catName(entry.categoryId)} · {entry.factories.length ? entry.factories.join(', ') : 'Opening / adjustment'} · Last received {fmtDate(entry.lastReceivedOn)} · {entry.locations.join(', ')}
                      {entry.totalValue !== undefined && entry.totalValue !== null && <> · Value {inr(entry.totalValue)}</>}
                    </div>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div><div className="text-xs text-slate-400 mb-0.5">On Hand</div><div className="text-lg font-bold text-slate-900">{entry.totalQty.toLocaleString('en-IN')}</div></div>
                    <div><div className="text-xs text-slate-400 mb-0.5">Reserved</div><div className="text-lg font-bold text-amber-600">{entry.totalReserved.toLocaleString('en-IN')}</div></div>
                    <div><div className="text-xs text-slate-400 mb-0.5">ATP</div><div className={`text-lg font-bold ${totalATP > 0 ? 'text-green-700' : 'text-red-500'}`}>{totalATP.toLocaleString('en-IN')}</div></div>
                  </div>
                </button>

                <div className="px-4 md:px-5 py-3 flex items-center gap-4 flex-wrap">
                  <Package size={13} className="text-slate-400 shrink-0" />
                  <div className="flex gap-3 flex-wrap">
                    {entry.sizes.map(s => (
                      <div key={s.sizeId} className="flex items-center gap-1.5 text-sm">
                        <span className="min-w-7 h-7 px-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{s.sizeName}</span>
                        <div className="text-xs">
                          <div className="font-semibold text-slate-900">{s.onHand}</div>
                          <div className={s.atp > 0 ? 'text-green-600' : 'text-red-400'}>{s.atp} ATP</div>
                        </div>
                      </div>
                    ))}
                    <div className="text-xs font-semibold text-slate-600 self-center">Total {entry.totalQty}</div>
                  </div>
                </div>

                <Collapse open={open === k}>
                  <div className="border-t border-slate-100 px-4 md:px-5 py-3">
                    {!lots[k] ? <div className="flex flex-col gap-2"><div className="skeleton h-3 w-3/4" /><div className="skeleton h-3 w-1/2" /></div> : (
                      <div className="flex flex-col gap-2">
                        {lots[k].map(l => (
                          <div key={`${l.lotNo}-${l.sizeName}-${l.locationCode}`} className="flex flex-wrap justify-between gap-2 text-xs text-slate-600 border-b border-slate-50 pb-1 last:border-0">
                            <span className="font-mono break-all">{l.lotNo}</span>
                            <span>Size {l.sizeName}</span>
                            <span>{l.qty} pcs</span>
                            <span>{fmtDate(l.receivedOn)}</span>
                            <span>{l.jobWorkerName ?? '—'}</span>
                            <span>{l.locationCode}</span>
                            {l.unitCost !== undefined && l.unitCost !== null && <span>Cost {inr(l.unitCost)}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Collapse>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
