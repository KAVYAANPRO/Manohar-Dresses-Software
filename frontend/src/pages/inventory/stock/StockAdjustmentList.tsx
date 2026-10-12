import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { stockAdjustmentsApi, fmtQty, type StockAdjustmentRow } from '../../../lib/api/inventory';
import { problemMessage, formatDate } from '../../../lib/api/procurement';

interface Adjustment {
  id: string;
  docNo: string;
  date: string;
  item: string;
  lot: string;
  location: string;
  difference: number;
  unit: string;
  reason: string;
  status: 'Pending Approval' | 'Approved' | 'Rejected';
  createdBy: string;
}

const STATUS: Record<StockAdjustmentRow['status'], Adjustment['status']> = {
  PROPOSED: 'Pending Approval', APPROVED: 'Approved', REJECTED: 'Rejected',
};
const statusColors: Record<Adjustment['status'], string> = {
  'Pending Approval': 'bg-yellow-100 text-yellow-800',
  'Approved': 'bg-green-100 text-green-800',
  'Rejected': 'bg-red-100 text-red-800',
};

export function StockAdjustmentList() {
  const navigate = useNavigate();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    stockAdjustmentsApi.list()
      .then(rows => active && setAdjustments(rows.map(r => ({
        id: r._id,
        docNo: r.docNo,
        date: formatDate(r.docDate),
        item: r.itemName ?? '—',
        lot: r.lotNo ?? (r.direction === 'IN' ? 'new lot' : '—'),
        location: r.locationName ?? r.locationCode ?? '—',
        difference: r.direction === 'OUT' ? -r.qty : r.qty,
        unit: r.uomCode ?? '',
        reason: r.reason,
        status: STATUS[r.status],
        createdBy: r.createdByName ?? '—',
      }))))
      .catch(err => active && setError(problemMessage(err, 'Could not load stock adjustments.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const q = search.toLowerCase();
  const filtered = adjustments.filter(a =>
    a.item.toLowerCase().includes(q) || a.docNo.toLowerCase().includes(q) || a.lot.toLowerCase().includes(q)
  );

  const columns = [
    { header: 'Adj. No.', accessor: (row: Adjustment) => <span className="font-mono font-semibold text-[#B80037]">{row.docNo}</span> },
    { header: 'Date', accessor: 'date' as keyof Adjustment },
    { header: 'Item', accessor: (row: Adjustment) => <div><div className="text-sm font-medium">{row.item}</div><div className="text-xs text-slate-500">{row.location} · lot {row.lot}</div></div> },
    {
      header: 'Adjustment',
      accessor: (row: Adjustment) => (
        <span className={`text-sm font-semibold ${row.difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
          {row.difference > 0 ? '+' : ''}{fmtQty(row.difference)} {row.unit}
        </span>
      ),
    },
    { header: 'Reason', accessor: 'reason' as keyof Adjustment },
    {
      header: 'Status',
      accessor: (row: Adjustment) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusColors[row.status]}`}>{row.status}</span>
      ),
    },
    { header: 'By', accessor: 'createdBy' as keyof Adjustment },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Stock Adjustments</h1>
          <p className="text-sm text-slate-500">Record and track stock corrections. Every adjustment is approved before it posts.</p>
        </div>
        <Can perm="adjustments.create">
          <Button className="w-full sm:w-auto" onClick={() => navigate('/inventory/adjustments/new')}>
            <Plus size={16} /> New Adjustment
          </Button>
        </Can>
      </div>
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search adjustments..."
        emptyMessage="No stock adjustments recorded yet."
        onRowClick={(row: Adjustment) => navigate(`/inventory/adjustments/${row.id}`)}
      />
    </div>
  );
}
