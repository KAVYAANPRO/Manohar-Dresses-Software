import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, AlertTriangle } from 'lucide-react';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { stockApi, fmtQty, type StockRow, type StockItemSummary } from '../../../lib/api/inventory';
import { problemMessage, formatDate } from '../../../lib/api/procurement';
import { EmptyState, STAGGER_CHILDREN, TabUnderline } from '../../pageKit';

type Tab = 'Warehouse' | 'Factory Custody' | 'Quarantine' | 'Reserved' | 'Available (ATP)';
const TABS: Tab[] = ['Warehouse', 'Factory Custody', 'Quarantine', 'Reserved', 'Available (ATP)'];
const KIND_FOR_TAB: Partial<Record<Tab, string>> = { Warehouse: 'WAREHOUSE', 'Factory Custody': 'FACTORY_CUSTODY', Quarantine: 'QUARANTINE' };

/** One card/row the screen shows: either a lot at a location, or (ATP tab) an item total. */
interface ViewRow {
  id: string;
  name: string;
  sub: string;
  location: string;
  lot: string;
  lotId?: string;
  stockItemId: string;
  quantity: number;
  unit: string;
  value: number;
  status: 'Available' | 'Low Stock' | 'Quarantine' | 'With Factory';
}

const statusBadge: Record<ViewRow['status'], string> = {
  Available: 'bg-green-100 text-green-800',
  'With Factory': 'bg-[#FFDCE5] text-[#8F002B]',
  'Low Stock': 'bg-orange-100 text-orange-800',
  Quarantine: 'bg-red-100 text-red-800',
};

export function StockOverview() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('Warehouse');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<StockRow[]>([]);
  const [items, setItems] = useState<StockItemSummary[]>([]);

  useEffect(() => {
    let active = true;
    stockApi.overview({ kind: 'RAW_MATERIAL' })
      .then(d => { if (active) { setRows(d.rows); setItems(d.items); } })
      .catch(err => active && setError(problemMessage(err, 'Could not load stock.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const lowIds = new Set(items.filter(i => i.lowStock).map(i => i.stockItemId));

  const rowsFor = (tab: Tab): ViewRow[] => {
    if (tab === 'Reserved') return [];
    if (tab === 'Available (ATP)') {
      return items.filter(i => i.onHand > 0 || i.lowStock).map(i => ({
        id: i.stockItemId,
        name: i.name,
        sub: i.minStockQty !== undefined ? `Min ${fmtQty(i.minStockQty)} ${i.uomCode ?? ''}` : (i.materialName ?? ''),
        location: 'All warehouses',
        lot: `${i.lotCount} lot${i.lotCount === 1 ? '' : 's'}`,
        stockItemId: i.stockItemId,
        quantity: i.onHand,
        unit: i.uomCode ?? '',
        value: i.value,
        status: i.lowStock ? 'Low Stock' : 'Available',
      }));
    }
    return rows.filter(r => r.locationKind === KIND_FOR_TAB[tab]).map(r => ({
      id: r.id,
      name: r.name,
      sub: [r.supplierName, r.receivedOn ? `received ${formatDate(r.receivedOn)}` : ''].filter(Boolean).join(' · '),
      location: r.locationName,
      lot: r.lotNo ?? '—',
      lotId: r.lotId,
      stockItemId: r.stockItemId,
      quantity: r.qty,
      unit: r.uomCode ?? '',
      value: r.value,
      status: r.locationKind === 'QUARANTINE' ? 'Quarantine' : r.locationKind === 'FACTORY_CUSTODY' ? 'With Factory' : lowIds.has(r.stockItemId) ? 'Low Stock' : 'Available',
    }));
  };

  const q = search.toLowerCase();
  const visible = rowsFor(activeTab).filter(i =>
    i.name.toLowerCase().includes(q) || i.lot.toLowerCase().includes(q) || i.location.toLowerCase().includes(q)
  );
  const lowStockCount = items.filter(i => i.lowStock).length;
  const open = (row: ViewRow) => navigate(row.lotId ? `/inventory/ledger?lotId=${row.lotId}` : `/inventory/ledger?stockItemId=${row.stockItemId}`);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Raw Material Stock</h1>
          <p className="text-sm text-slate-500">View stock across warehouse, factory custody, quarantine, and reserved quantities.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <button
            onClick={() => navigate('/inventory/adjustments/new')}
            className="inline-flex items-center justify-center gap-2 min-h-10 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Stock Adjustment
          </button>
          <button
            onClick={() => navigate('/inventory/ledger')}
            className="inline-flex items-center justify-center gap-2 min-h-10 px-4 py-2 text-sm font-medium rounded-lg bg-[#E40043] text-white hover:bg-[#B80037] transition-colors"
          >
            <Package size={16} />
            Stock Ledger
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {lowStockCount > 0 && (
        <button type="button" onClick={() => setActiveTab('Available (ATP)')} className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-left">
          <AlertTriangle size={18} className="text-orange-500 shrink-0" />
          <p className="text-sm text-orange-800">
            <span className="font-semibold">{lowStockCount} material{lowStockCount > 1 ? 's' : ''}</span> in warehouse {lowStockCount > 1 ? 'are' : 'is'} at or below minimum stock level.
          </p>
        </button>
      )}

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'relative px-4 py-2.5 min-h-[44px] text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap shrink-0',
              activeTab === tab ? 'border-transparent text-[#E40043]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            ].join(' ')}
          >
            {activeTab === tab && <TabUnderline group="stock" />}
            {tab}
            <span className={['ml-1.5 px-1.5 py-0.5 text-xs rounded-full', activeTab === tab ? 'bg-[#FFDCE5] text-[#B80037]' : 'bg-slate-100 text-slate-500'].join(' ')}>
              {isLoading ? '…' : rowsFor(tab).length}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'Reserved' && (
        <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          Raw material is not reserved against orders — it is committed when issued to a job slip (see Factory Custody). Available (ATP) therefore equals warehouse on-hand.
        </p>
      )}

      <div className="relative max-w-sm">
        <input
          type="text"
          placeholder="Search by material, colour, lot or location..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
      </div>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Material Variant', 'Location', 'Lot', 'Quantity', 'Value', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-200 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              : visible.length === 0
              ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">No stock found in this category.</td>
                </tr>
              )
              : visible.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => open(row)}>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-slate-900">{row.name}</div>
                      <div className="text-xs text-slate-500">{row.sub}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{row.location}</td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{row.lot}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-900">{fmtQty(row.quantity)} {row.unit}</td>
                    <td className="px-4 py-3 text-sm text-slate-600"><RestrictedValue perm="stock.rate.view">₹{(row.value ?? 0).toLocaleString('en-IN')}</RestrictedValue></td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusBadge[row.status]}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-white animate-pulse">
                <div className="h-4 w-1/2 bg-slate-200 rounded" />
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
              </div>
            ))
          : visible.length === 0
          ? (
            <EmptyState message="No stock found in this category." />
          )
          : visible.map(row => (
              <button key={row.id} type="button" onClick={() => open(row)}
                className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-white text-left hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 break-words">{row.name}</div>
                    <div className="text-xs text-slate-500">{row.sub}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusBadge[row.status]}`}>{row.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 w-full text-sm">
                  <div>
                    <div className="text-xs font-medium text-muted">Quantity</div>
                    <div className="font-semibold text-slate-900">{fmtQty(row.quantity)} {row.unit}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">Location</div>
                    <div className="text-slate-700">{row.location}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">Lot</div>
                    <div className="font-mono text-slate-600 break-all">{row.lot}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">Value</div>
                    <div className="text-slate-600"><RestrictedValue perm="stock.rate.view">₹{(row.value ?? 0).toLocaleString('en-IN')}</RestrictedValue></div>
                  </div>
                </div>
              </button>
            ))}
      </div>
    </div>
  );
}
