import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { stockApi, fmtQty, type LotRow } from '../../../lib/api/inventory';
import { problemMessage, formatDate } from '../../../lib/api/procurement';

const statusLabel: Record<LotRow['status'], string> = { ACTIVE: 'Active', EXHAUSTED: 'Exhausted', QUARANTINE: 'Quarantine' };
const statusColors: Record<LotRow['status'], string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  EXHAUSTED: 'bg-gray-100 text-gray-600',
  QUARANTINE: 'bg-red-100 text-red-800',
};

export function LotList() {
  const navigate = useNavigate();
  const [lots, setLots] = useState<LotRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hideExhausted, setHideExhausted] = useState(false);

  useEffect(() => {
    let active = true;
    stockApi.lots({ kind: 'RAW_MATERIAL' })
      .then(rows => active && setLots(rows))
      .catch(err => active && setError(problemMessage(err, 'Could not load lots.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const q = search.toLowerCase();
  const filtered = lots.filter(l =>
    (!hideExhausted || l.status !== 'EXHAUSTED') &&
    (l.lotNo.toLowerCase().includes(q) || l.name.toLowerCase().includes(q) || (l.supplierName ?? '').toLowerCase().includes(q) || (l.originDocNo ?? '').toLowerCase().includes(q))
  );

  const columns = [
    { header: 'Lot Number', accessor: (row: LotRow) => <span className="font-mono font-semibold text-slate-800">{row.lotNo}</span> },
    {
      header: 'Material / Variant',
      accessor: (row: LotRow) => (
        <div>
          <div className="text-sm font-medium text-slate-900">{row.name}</div>
          <div className="text-xs text-slate-500">{[row.supplierName, formatDate(row.receivedOn), row.originDocNo].filter(Boolean).join(' · ')}</div>
        </div>
      ),
    },
    {
      header: 'Quantity',
      accessor: (row: LotRow) => (
        <div className="text-sm">
          <span className="font-semibold text-slate-900">{fmtQty(row.remainingQty)}</span>
          <span className="text-slate-400"> / {fmtQty(row.initialQty)} {row.uomCode ?? ''}</span>
        </div>
      ),
    },
    {
      header: 'Usage',
      accessor: (row: LotRow) => {
        const pct = row.initialQty > 0 ? Math.min(100, Math.max(0, Math.round(((row.initialQty - row.remainingQty) / row.initialQty) * 100))) : 0;
        return (
          <div className="flex items-center gap-2 min-w-[80px]">
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-[#E40043] rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-slate-500">{pct}%</span>
          </div>
        );
      },
    },
    { header: 'Unit Cost', accessor: (row: LotRow) => <RestrictedValue perm="stock.rate.view">₹{(row.unitCost ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}</RestrictedValue> },
    { header: 'Location', accessor: (row: LotRow) => row.locations.length ? row.locations.map(l => `${l.locationName} (${fmtQty(l.qty)})`).join(', ') : '—' },
    {
      header: 'Status',
      accessor: (row: LotRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusColors[row.status]}`}>{statusLabel[row.status]}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Lots</h1>
        <p className="text-sm text-slate-500">Track raw material lots. Each inward creates a traceable lot carrying its landed cost.</p>
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      <label className="flex items-center gap-2 text-sm text-slate-600 select-none">
        <input type="checkbox" className="w-4 h-4" checked={hideExhausted} onChange={e => setHideExhausted(e.target.checked)} />
        Hide exhausted lots
      </label>
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by lot, material, supplier or inward..."
        emptyMessage="No lots found."
        onRowClick={(row: LotRow) => navigate(`/inventory/ledger?lotId=${row.lotId}`)}
      />
    </div>
  );
}
