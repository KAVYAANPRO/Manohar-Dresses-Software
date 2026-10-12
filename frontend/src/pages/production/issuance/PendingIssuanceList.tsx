import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Share } from 'lucide-react';
import { designsApi, jobWorkersApi, materialIssuesApi, toProblem, fmtDate } from '../../../lib/api/production';

interface PendingIssuance {
  id: string; // Job Slip ID
  slipNumber: string;
  factoryName: string;
  designSku: string;
  totalMaterialsNeeded: number;
  targetDate: string;
  status: 'Pending Issuance' | 'Partial Issuance' | 'Fully Issued';
}

export function PendingIssuanceList() {
  const navigate = useNavigate();
  const [issuances, setIssuances] = useState<PendingIssuance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([materialIssuesApi.pending(showAll), designsApi.list().catch(() => []), jobWorkersApi.list().catch(() => [])])
      .then(([rows, designs, workers]) => {
        const dNo = new Map(designs.map(d => [d._id, `${d.designNo} ${d.name}`]));
        const wName = new Map(workers.map(w => [w._id, w.name]));
        setIssuances(rows.map(r => ({
          id: r.jobSlipId,
          slipNumber: r.jobSlipNo,
          factoryName: wName.get(r.jobWorkerId) ?? '—',
          designSku: dNo.get(r.designId) ?? '—',
          totalMaterialsNeeded: r.materialsPending,
          targetDate: fmtDate(r.expectedCompletionDate),
          status: r.fullyIssued ? 'Fully Issued' : r.anyIssued ? 'Partial Issuance' : 'Pending Issuance',
        })));
        setLoadError('');
      })
      .catch(err => setLoadError(toProblem(err, 'Could not load pending issuances.').detail))
      .finally(() => setIsLoading(false));
  }, [showAll]);

  const q = searchTerm.toLowerCase();
  const filteredIssuances = issuances.filter(i =>
    i.slipNumber.toLowerCase().includes(q) || i.factoryName.toLowerCase().includes(q) || i.designSku.toLowerCase().includes(q)
  );

  const badge: Record<PendingIssuance['status'], string> = {
    'Pending Issuance': 'bg-red-100 text-red-800',
    'Partial Issuance': 'bg-orange-100 text-orange-800',
    'Fully Issued': 'bg-green-100 text-green-800',
  };

  const columns = [
    { header: 'Job Slip', accessor: 'slipNumber' as keyof PendingIssuance },
    { header: 'Factory / Karigar', accessor: 'factoryName' as keyof PendingIssuance },
    { header: 'Design', accessor: 'designSku' as keyof PendingIssuance },
    { header: 'Materials Pending', accessor: (row: PendingIssuance) => `${row.totalMaterialsNeeded} item${row.totalMaterialsNeeded === 1 ? '' : 's'}` },
    { header: 'Target Date', accessor: 'targetDate' as keyof PendingIssuance },
    {
      header: 'Status',
      accessor: (row: PendingIssuance) => <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${badge[row.status]}`}>{row.status}</span>,
    },
    {
      header: 'Action',
      accessor: (row: PendingIssuance) => (
        <Button onClick={(e) => { e.stopPropagation(); navigate(`/production/issuance/${row.id}`); }}>
          <Share size={14} className="mr-1" /> Issue
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Material Issuance</h1>
          <p className="text-muted">Issue raw materials from the main warehouse to factories against job slips.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 min-h-10">
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Include fully issued
        </label>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <DataTable
        columns={columns}
        data={filteredIssuances}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by job slip, factory or design..."
        emptyMessage="No job slips waiting for material."
        onRowClick={(row: PendingIssuance) => navigate(`/production/issuance/${row.id}`)}
      />
    </div>
  );
}
