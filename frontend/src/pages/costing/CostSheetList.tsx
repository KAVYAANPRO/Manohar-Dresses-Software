import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../components/tables/DataTable';
import { Lock, AlertTriangle } from 'lucide-react';
import { Can } from '../../lib/permissions/Can';
import { usePermission } from '../../lib/permissions/usePermission';
import { formatAmountWithExpenses } from '../../lib/format/money';
import { costingApi, type CostSheetRow } from '../../lib/api/jobwork';
import { toProblem, fmtDate } from '../../lib/api/production';

function inr(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CostSheetList() {
  const navigate = useNavigate();
  const { has } = usePermission();
  const allowed = has('costing.view');
  const [items, setItems] = useState<CostSheetRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | 'MANUFACTURING' | 'PROCESSING'>('');

  useEffect(() => {
    if (!allowed) { setIsLoading(false); return; }
    setIsLoading(true);
    costingApi.list(type ? { jobType: type } : undefined)
      .then(setItems)
      .catch(e => setError(toProblem(e).detail))
      .finally(() => setIsLoading(false));
  }, [allowed, type]);

  const q = search.toLowerCase();
  const filtered = items.filter(c => c.jobSlip.toLowerCase().includes(q) || c.design.toLowerCase().includes(q) || c.factory.toLowerCase().includes(q));

  const columns = [
    {
      header: 'Job Slip',
      accessor: (row: CostSheetRow) => (
        <div>
          <div className="font-medium text-slate-900">{row.jobSlip}</div>
          <div className="text-xs text-slate-400">{row.jobType === 'PROCESSING' ? 'Processing' : 'Manufacturing'} · {fmtDate(row.date)}</div>
        </div>
      ),
    },
    { header: 'Design', accessor: 'design' as keyof CostSheetRow },
    { header: 'Factory', accessor: 'factory' as keyof CostSheetRow },
    {
      header: 'Accepted Qty',
      accessor: (row: CostSheetRow) => (
        <span className="font-medium text-slate-900">{row.acceptedQty > 0 ? row.acceptedQty.toLocaleString('en-IN') + (row.jobType === 'PROCESSING' ? '' : ' pcs') : '—'}</span>
      ),
    },
    {
      header: 'Total Cost',
      accessor: (row: CostSheetRow) => (
        <span className="font-semibold text-slate-900 whitespace-nowrap">{row.totalCost > 0 ? formatAmountWithExpenses(row.totalCost - row.expenses, row.expenses || undefined) : '—'}</span>
      ),
    },
    {
      header: 'Cost / Unit',
      accessor: (row: CostSheetRow) => <span className="font-semibold text-[#B80037]">{row.costPerGarment > 0 ? inr(row.costPerGarment) : '—'}</span>,
    },
    {
      header: 'Margin',
      accessor: (row: CostSheetRow) => row.sellingRate > 0 && row.costPerGarment > 0 ? (
        <span className={`font-semibold ${row.marginPct >= 20 ? 'text-green-700' : row.marginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
          {inr(row.margin)} <span className="text-xs">({row.marginPct}%)</span>
        </span>
      ) : <span className="text-slate-400">—</span>,
    },
    {
      header: 'Type',
      accessor: (row: CostSheetRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${row.type === 'Final' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{row.type}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Cost Sheets</h1>
            <Lock size={16} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-500">Provisional until the job is closed, final after. Visible to authorised users only.</p>
        </div>
        {allowed && (
          <select value={type} onChange={e => setType(e.target.value as typeof type)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]">
            <option value="">All jobs</option>
            <option value="MANUFACTURING">Manufacturing</option>
            <option value="PROCESSING">Processing</option>
          </select>
        )}
      </div>
      <Can
        perm="costing.view"
        fallback={<div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">You don't have permission to view costing data.</div>}
      >
        {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3"><AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}</div>}
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by job slip, design or factory..."
          emptyMessage="No cost sheets yet — they appear once material is issued to a job."
          onRowClick={(row: CostSheetRow) => navigate(`/costing/${row.id}`)}
        />
      </Can>
    </div>
  );
}
