import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus, AlertTriangle } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { jobReceiptsApi } from '../../../lib/api/jobwork';
import { toProblem, fmtDate, fmtQty } from '../../../lib/api/production';

interface Receiving {
  id: string;
  recNo: string;
  date: string;
  jobSlip: string;
  jobSlipId: string;
  factory: string;
  design: string;
  expected: number;
  received: number;
  accepted: number;
  rejected: number;
  status: 'Draft' | 'Confirmed' | 'Cancelled';
  warnings: number;
}

const STATUS_LABEL = { DRAFT: 'Draft', CONFIRMED: 'Confirmed', CANCELLED: 'Cancelled' } as const;
const statusCls: Record<Receiving['status'], string> = {
  Confirmed: 'bg-green-100 text-green-800',
  Draft: 'bg-yellow-100 text-yellow-800',
  Cancelled: 'bg-slate-100 text-slate-500',
};

export function ReceivingList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Receiving[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let alive = true;
    jobReceiptsApi
      .list({ jobType: 'MANUFACTURING' })
      .then(rows => {
        if (!alive) return;
        setItems(rows.map(r => ({
          id: r._id,
          recNo: r.docNo,
          date: fmtDate(r.docDate),
          jobSlip: r.jobSlipNo ?? '—',
          jobSlipId: r.jobSlipId,
          factory: r.jobWorkerName ?? '—',
          design: [r.designNo, r.designName].filter(Boolean).join(' — '),
          expected: r.jobSlipExpectedTotal ?? r.totals.expected,
          received: r.totals.received,
          accepted: r.totals.accepted,
          rejected: r.totals.rejected + r.totals.damaged,
          status: STATUS_LABEL[r.status],
          warnings: r.warnings?.length ?? 0,
        })));
      })
      .catch(err => alive && setError(toProblem(err).detail))
      .finally(() => alive && setIsLoading(false));
    return () => { alive = false; };
  }, []);

  const q = search.toLowerCase();
  const filtered = items.filter(r =>
    r.recNo.toLowerCase().includes(q) ||
    r.jobSlip.toLowerCase().includes(q) ||
    r.factory.toLowerCase().includes(q) ||
    r.design.toLowerCase().includes(q)
  );

  const columns = [
    { header: 'Rec. No.', accessor: 'recNo' as keyof Receiving },
    { header: 'Date', accessor: 'date' as keyof Receiving },
    {
      header: 'Job Slip / Factory',
      accessor: (row: Receiving) => (
        <div>
          <div className="text-sm font-medium text-slate-900">{row.jobSlip}</div>
          <div className="text-xs text-slate-500">{row.factory}</div>
        </div>
      ),
    },
    { header: 'Design', accessor: 'design' as keyof Receiving },
    {
      header: 'Qty (Exp / Acc / Rej)',
      accessor: (row: Receiving) => (
        <div className="text-sm whitespace-nowrap">
          <span className="text-slate-500">{fmtQty(row.expected)}</span>
          {' / '}
          <span className="text-green-700 font-medium">{fmtQty(row.accepted)}</span>
          {' / '}
          <span className="text-red-500 font-medium">{fmtQty(row.rejected)}</span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Receiving) => (
        <span className="inline-flex items-center gap-1">
          <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[row.status]}`}>{row.status}</span>
          {row.warnings > 0 && <AlertTriangle size={13} className="text-amber-500" aria-label="Has warnings" />}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Finished Goods Receiving</h1>
          <p className="text-sm text-slate-500">Receive completed garments from factories. Accepted goes to Ready Stock; rejected and damaged to Quarantine.</p>
        </div>
        <Can perm="receiving.edit">
          <Button onClick={() => navigate('/production/receiving/new')} className="w-full sm:w-auto shrink-0">
            <Plus size={16} /> New Receiving
          </Button>
        </Can>
      </div>
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by rec. no., job slip, factory or design..."
        emptyMessage="No receiving records yet."
        onRowClick={(row: Receiving) => navigate(`/production/receiving/${row.id}`)}
      />
    </div>
  );
}
