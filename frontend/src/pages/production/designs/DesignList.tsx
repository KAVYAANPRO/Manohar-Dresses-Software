import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { designsApi, lookupsApi, toProblem, fmtDate } from '../../../lib/api/production';

interface DesignRow {
  id: string;
  designNo: string;
  name: string;
  category: string;
  type: string;
  variantCount: number;
  status: 'Active' | 'Inactive';
  updatedDate: string;
}

const statusColors: Record<DesignRow['status'], string> = {
  Active: 'bg-green-100 text-green-800',
  Inactive: 'bg-gray-100 text-gray-600',
};

export function DesignList() {
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<DesignRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    Promise.all([designsApi.list(), lookupsApi.productCategories().catch(() => [])])
      .then(([list, cats]) => {
        const catName = new Map(cats.map(c => [c._id, c.name]));
        setDesigns(list.map(d => ({
          id: d._id,
          designNo: d.designNo,
          name: d.name,
          category: catName.get(d.productCategoryId) ?? '—',
          type: d.productType || '—',
          variantCount: (d.colourOptions?.length ?? 0) * (d.sizeOptions?.length ?? 0),
          status: d.isActive ? 'Active' : 'Inactive',
          updatedDate: fmtDate(d.updatedAt),
        })));
      })
      .catch(err => setLoadError(toProblem(err, 'Could not load designs.').detail))
      .finally(() => setIsLoading(false));
  }, []);

  const q = searchTerm.toLowerCase();
  const filtered = designs.filter(d =>
    d.designNo.toLowerCase().includes(q) ||
    d.name.toLowerCase().includes(q) ||
    d.category.toLowerCase().includes(q)
  );

  const columns = [
    {
      header: 'Design Code',
      accessor: (row: DesignRow) => (
        <div>
          <div className="text-sm font-semibold text-slate-900">{row.designNo}</div>
          <div className="text-xs text-slate-500">{row.category}{row.type ? ` · ${row.type}` : ''}</div>
        </div>
      ),
    },
    {
      header: 'Variants',
      accessor: (row: DesignRow) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors bg-[#FFF0F3] text-[#B80037]">
          {row.variantCount} variants
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: DesignRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusColors[row.status]}`}>
          {row.status}
        </span>
      ),
    },
    { header: 'Updated', accessor: 'updatedDate' as keyof DesignRow },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Designs & BOM Catalog</h1>
          <p className="text-sm text-slate-500">Manage product designs, variants, and Bills of Material.</p>
        </div>
        <Button onClick={() => navigate('/production/designs/new')} className="w-full sm:w-auto">
          <Plus size={16} /> Create Design
        </Button>
      </div>
      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by design no., name or category..."
        emptyMessage="No designs yet. Create your first design."
        onRowClick={(row: DesignRow) => navigate(`/production/designs/${row.id}`)}
      />
    </div>
  );
}
