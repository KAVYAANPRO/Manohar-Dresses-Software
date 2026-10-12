import { useState, useEffect } from 'react';
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { readyStockApi, apiErrorMessage, type PackingRow } from '../../lib/api/sales';
import { Can } from '../../lib/permissions/Can';
import { ErrorBanner } from '../sales/shared';
import { EmptyState, STAGGER_CHILDREN, FilterPills } from '../pageKit';

type StatusLabel = 'Fully Packed' | 'Partially Packed' | 'Unpacked';
const label: Record<PackingRow['packingStatus'], StatusLabel> = {
  FULLY_PACKED: 'Fully Packed', PARTIALLY_PACKED: 'Partially Packed', UNPACKED: 'Unpacked',
};
const statusConfig: Record<StatusLabel, { cls: string; icon: React.ReactNode }> = {
  'Fully Packed': { cls: 'bg-green-100 text-green-800', icon: <CheckCircle size={13} /> },
  'Partially Packed': { cls: 'bg-amber-100 text-amber-700', icon: <Clock size={13} /> },
  'Unpacked': { cls: 'bg-slate-100 text-slate-600', icon: <AlertTriangle size={13} /> },
};

export function PackingDashboard() {
  const [rows, setRows] = useState<PackingRow[]>([]);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | StatusLabel>('All');
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    readyStockApi.packing()
      .then(setRows)
      .catch(e => setError(apiErrorMessage(e, 'Could not load the packing dashboard.')))
      .finally(() => setIsLoading(false));

  useEffect(() => {
    load();
    readyStockApi.categories().then(c => setCategories(Object.fromEntries(c.map(x => [x._id, x.name])))).catch(() => undefined);
  }, []);

  const act = async (row: PackingRow, kind: 'pack' | 'unpack') => {
    const n = Number(qty[row.stockItemId] || (kind === 'pack' ? row.pendingQty : row.packedQty));
    if (!n || n <= 0) return;
    setBusy(row.stockItemId);
    setError('');
    try {
      await (kind === 'pack' ? readyStockApi.pack(row.stockItemId, n) : readyStockApi.unpack(row.stockItemId, n));
      setQty(p => ({ ...p, [row.stockItemId]: '' }));
      await load();
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const q = search.toLowerCase();
  const filtered = rows.filter(r =>
    (statusFilter === 'All' || label[r.packingStatus] === statusFilter) &&
    (r.designName.toLowerCase().includes(q) || r.designNo.toLowerCase().includes(q) || r.colourName.toLowerCase().includes(q)),
  );

  const totalAvailable = rows.reduce((s, r) => s + r.onHand, 0);
  const totalPacked = rows.reduce((s, r) => s + r.packedQty, 0);
  const totalPending = rows.reduce((s, r) => s + r.pendingQty, 0);

  const actions = (row: PackingRow) => (
    <Can perm="packing.edit">
      <div className="flex items-center gap-1.5">
        <input type="number" inputMode="numeric" min={1} aria-label="Quantity" placeholder={String(row.pendingQty || row.packedQty)}
          value={qty[row.stockItemId] ?? ''} onChange={e => setQty(p => ({ ...p, [row.stockItemId]: e.target.value }))}
          className="w-20 px-2 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
        <button disabled={busy === row.stockItemId || row.pendingQty <= 0} onClick={() => act(row, 'pack')}
          className="min-h-[40px] px-3 text-xs font-medium bg-[#E40043] text-white rounded-lg disabled:opacity-40">Pack</button>
        <button disabled={busy === row.stockItemId || row.packedQty <= 0} onClick={() => act(row, 'unpack')}
          className="min-h-[40px] px-3 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg disabled:opacity-40">Unpack</button>
      </div>
    </Can>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Packing Dashboard</h1>
        <p className="text-sm text-slate-500">Track packing progress by design, colour and size. Packing is a status — it does not move stock. Leave the quantity blank to pack everything pending.</p>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sm:p-4 text-center min-w-0">
          <div className="text-xs text-slate-400 mb-1">Available</div>
          <div className="text-xl sm:text-2xl font-bold break-words text-slate-900">{totalAvailable.toLocaleString('en-IN')}</div>
          <div className="text-xs text-slate-400">pcs</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-3 sm:p-4 text-center min-w-0">
          <div className="text-xs text-green-500 mb-1">Packed</div>
          <div className="text-xl sm:text-2xl font-bold break-words text-green-700">{totalPacked.toLocaleString('en-IN')}</div>
          <div className="text-xs text-green-400">pcs</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-3 sm:p-4 text-center min-w-0">
          <div className="text-xs text-amber-500 mb-1">Pending</div>
          <div className="text-xl sm:text-2xl font-bold break-words text-amber-700">{totalPending.toLocaleString('en-IN')}</div>
          <div className="text-xs text-amber-400">pcs</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[200px] max-w-full sm:max-w-sm">
          <input type="text" placeholder="Search by design or colour..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <FilterPills options={['All', 'Unpacked', 'Partially Packed', 'Fully Packed'] as const} value={statusFilter} onChange={setStatusFilter} className="basis-full sm:basis-auto" />
      </div>

      {/* Mobile cards */}
      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />)
        ) : filtered.length === 0 ? (
          <EmptyState message="No packing records found." />
        ) : filtered.map(row => {
          const pct = row.onHand > 0 ? Math.round((row.packedQty / row.onHand) * 100) : 0;
          const cfg = statusConfig[label[row.packingStatus]];
          return (
            <div key={row.stockItemId} className="flex flex-col gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-slate-900 break-words">{row.designNo}</div>
                  <div className="text-xs text-slate-400">{categories[row.categoryId] ?? ''}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{row.colourName} · Size {row.sizeName}</div>
                </div>
                <span className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${cfg.cls}`}>{cfg.icon} {label[row.packingStatus]}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div><div className="text-xs font-medium text-muted">Available</div><div className="font-medium text-slate-900">{row.onHand.toLocaleString('en-IN')}</div></div>
                <div><div className="text-xs font-medium text-muted">Packed</div><div className="font-semibold text-green-700">{row.packedQty.toLocaleString('en-IN')}</div></div>
                <div><div className="text-xs font-medium text-muted">Pending</div><div className="font-semibold text-amber-600">{row.pendingQty.toLocaleString('en-IN')}</div></div>
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
              </div>
              {actions(row)}
            </div>
          );
        })}
      </div>

      {/* Table */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Design', 'Category', 'Colour', 'Size', 'Available', 'Packed', 'Pending', 'Status', 'Update'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">
                  {Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>)}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="p-4"><EmptyState message="No packing records found." className="border-0" /></td></tr>
            ) : filtered.map(row => {
              const pct = row.onHand > 0 ? Math.round((row.packedQty / row.onHand) * 100) : 0;
              const cfg = statusConfig[label[row.packingStatus]];
              return (
                <tr key={row.stockItemId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{row.designNo}</div></td>
                  <td className="px-4 py-3 text-slate-600">{categories[row.categoryId] ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{row.colourName}</td>
                  <td className="px-4 py-3"><span className="min-w-8 h-8 px-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center">{row.sizeName}</span></td>
                  <td className="px-4 py-3 font-medium text-slate-900">{row.onHand.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 font-semibold text-green-700">{row.packedQty.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 font-semibold text-amber-600">{row.pendingQty.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors w-fit ${cfg.cls}`}>{cfg.icon} {label[row.packingStatus]}</span>
                      <div className="w-20 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{actions(row)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
