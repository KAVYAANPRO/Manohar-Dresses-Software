import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { designsApi, productionOrdersApi, lookupsApi, toProblem, fmtDate } from '../../../lib/api/production';

interface Requirement {
  id: string;
  reqNo: string;
  design: string;
  colour: string;
  size: string;
  quantity: number;
  plannedDate: string;
  status: 'Stock OK' | 'Shortfall' | 'Cancelled';
}

const statusColors: Record<Requirement['status'], string> = {
  'Stock OK': 'bg-green-100 text-green-800',
  Shortfall: 'bg-red-100 text-red-800',
  Cancelled: 'bg-slate-100 text-slate-600',
};

export function ProductionRequirementList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Requirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      productionOrdersApi.list(),
      designsApi.list().catch(() => []),
      lookupsApi.colours().catch(() => []),
      lookupsApi.sizes().catch(() => []),
    ])
      .then(([orders, designs, colours, sizes]) => {
        const dName = new Map(designs.map(d => [d._id, `${d.designNo} ${d.name}`]));
        const cName = new Map(colours.map(c => [c._id, c.name]));
        const sName = new Map(sizes.map(s => [s._id, s.name]));
        setItems(orders.map(o => ({
          id: o._id,
          reqNo: o.docNo,
          design: dName.get(String(o.designId)) ?? '—',
          colour: Array.from(new Set(o.quantities.map(q => cName.get(String(q.colourId)) ?? '?'))).join(', '),
          size: Array.from(new Set(o.quantities.map(q => sName.get(String(q.sizeId)) ?? '?'))).join(', '),
          quantity: o.totalGarments,
          plannedDate: fmtDate(o.plannedStartDate),
          status: o.status === 'CANCELLED' ? 'Cancelled' : o.stockCheckPassed ? 'Stock OK' : 'Shortfall',
        })));
      })
      .catch(err => setLoadError(toProblem(err, 'Could not load production requirements.').detail))
      .finally(() => setIsLoading(false));
  }, []);

  const q = search.toLowerCase();
  const filtered = items.filter(i =>
    i.reqNo.toLowerCase().includes(q) || i.design.toLowerCase().includes(q) || i.colour.toLowerCase().includes(q)
  );

  const columns = [
    { header: 'Req. No.', accessor: 'reqNo' as keyof Requirement },
    { header: 'Design', accessor: 'design' as keyof Requirement },
    { header: 'Colour', accessor: 'colour' as keyof Requirement },
    { header: 'Size(s)', accessor: 'size' as keyof Requirement },
    { header: 'Qty (pcs)', accessor: (row: Requirement) => row.quantity.toLocaleString('en-IN') },
    { header: 'Planned Start', accessor: 'plannedDate' as keyof Requirement },
    {
      header: 'Status',
      accessor: (row: Requirement) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusColors[row.status]}`}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Production Requirements</h1>
          <p className="text-sm text-slate-500">Plan what to make; material needed is checked against the main warehouse.</p>
        </div>
        <Button onClick={() => navigate('/production/requirements/new')} className="w-full sm:w-auto">
          <Plus size={16} /> New Requirement
        </Button>
      </div>
      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by req. no., design or colour..."
        emptyMessage="No production requirements yet."
        onRowClick={(row: Requirement) => navigate(`/production/requirements/${row.id}`)}
      />
    </div>
  );
}
