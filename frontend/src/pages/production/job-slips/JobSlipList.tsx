import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import type { JobSlipStatus } from '../../../types/domain';
import { designsApi, jobSlipsApi, jobWorkersApi, toProblem, fmtDate, JOB_SLIP_STATUS_LABEL } from '../../../lib/api/production';
import { FilterPills } from '../../pageKit';

interface JobSlipRow {
  id: string;
  slipNumber: string;
  designSku: string;
  factoryName: string;
  type: string;
  batchQty: number;
  targetDate: string;
  overdue: boolean;
  status: JobSlipStatus;
}

export function JobSlipList() {
  const navigate = useNavigate();
  const [jobSlips, setJobSlips] = useState<JobSlipRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [quickFilter, setQuickFilter] = useState<'All' | 'Pending' | 'Completed' | 'Overdue'>('All');

  useEffect(() => {
    Promise.all([jobSlipsApi.list(), designsApi.list().catch(() => []), jobWorkersApi.list().catch(() => [])])
      .then(([slips, designs, workers]) => {
        const dNo = new Map(designs.map(d => [d._id, d.designNo]));
        const wName = new Map(workers.map(w => [w._id, w.name]));
        setJobSlips(slips.map(s => {
          const status = JOB_SLIP_STATUS_LABEL[s.status];
          // Material-based slips (karigar's own design) and dyeing jobs made for one of their parts.
          const extra = s as unknown as { materialBased?: boolean; lotNo?: string; parentJobSlipId?: string; partLabel?: string };
          const pieces = s.expectedOutputLines.reduce((t, l) => t + l.expectedQty, 0);
          const open = !['CLOSED', 'CANCELLED', 'RECEIVED'].includes(s.status);
          return {
            id: s._id,
            slipNumber: extra.lotNo ? `${extra.lotNo} · ${s.docNo}` : s.docNo,
            designSku: s.designId
              ? (dNo.get(String(s.designId)) ?? '—')
              : extra.parentJobSlipId
                ? `Dyeing · ${extra.partLabel ?? 'part'}`
                : 'Karigar’s own',
            factoryName: wName.get(String(s.jobWorkerId)) ?? '—',
            type: s.jobType === 'MANUFACTURING' ? 'Manufacturing' : 'Processing',
            batchQty: pieces,
            targetDate: fmtDate(s.expectedCompletionDate),
            overdue: open && !!s.expectedCompletionDate && new Date(s.expectedCompletionDate) < new Date(),
            status,
          };
        }));
      })
      .catch(err => setLoadError(toProblem(err, 'Could not load job slips.').detail))
      .finally(() => setIsLoading(false));
  }, []);

  const q = searchTerm.toLowerCase();
  const filteredSlips = jobSlips.filter(js =>
    js.slipNumber.toLowerCase().includes(q) ||
    js.designSku.toLowerCase().includes(q) ||
    js.factoryName.toLowerCase().includes(q)
  ).filter(js =>
    quickFilter === 'All' ||
    (quickFilter === 'Overdue' ? js.overdue :
      quickFilter === 'Completed' ? (js.status === 'Received' || js.status === 'Closed') :
        (js.status !== 'Received' && js.status !== 'Closed' && js.status !== 'Cancelled'))
  );

  const getStatusBadgeClass = (status: JobSlipStatus) => {
    switch (status) {
      case 'Closed':
      case 'Received': return 'bg-green-100 text-green-800';
      case 'In Process':
      case 'Ready':
      case 'Partially Received': return 'bg-[#FFDCE5] text-[#8F002B]';
      case 'Material Issued': return 'bg-yellow-100 text-yellow-800';
      case 'Created': return 'bg-gray-100 text-gray-800';
      case 'Cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const columns = [
    { header: 'Slip Number', accessor: 'slipNumber' as keyof JobSlipRow },
    { header: 'Design', accessor: 'designSku' as keyof JobSlipRow },
    { header: 'Factory / Karigar', accessor: 'factoryName' as keyof JobSlipRow },
    { header: 'Batch Qty', accessor: (row: JobSlipRow) => (row.batchQty > 0 ? `${row.batchQty.toLocaleString('en-IN')}${row.type === 'Manufacturing' ? ' pcs' : ' m'}` : '—') },
    {
      header: 'Target Date',
      accessor: (row: JobSlipRow) => <span className={row.overdue ? 'text-red-600 font-medium' : ''}>{row.targetDate}{row.overdue ? ' (overdue)' : ''}</span>,
    },
    {
      header: 'Status',
      accessor: (row: JobSlipRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${getStatusBadgeClass(row.status)}`}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Job Slips</h1>
          <p className="text-muted">Manage production orders and track factory progress.</p>
        </div>
        <Button onClick={() => navigate('/production/job-slips/new')} className="w-full sm:w-auto">
          <Plus size={16} /> Create Job Slip
        </Button>
      </div>

      <FilterPills options={['All', 'Pending', 'Overdue', 'Completed'] as const} value={quickFilter} onChange={setQuickFilter} />

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <DataTable
        columns={columns}
        data={filteredSlips}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by slip number, design, or factory..."
        emptyMessage="No job slips found."
        onRowClick={(row: JobSlipRow) => navigate(`/production/job-slips/${row.id}`)}
      />
    </div>
  );
}
