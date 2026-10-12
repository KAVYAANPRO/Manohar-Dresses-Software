import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { materialsApi, materialCategoriesApi, uomsApi, materialVariantsApi, problemMessage } from '../../../lib/api/procurement';

interface MaterialRow {
  id: string;
  name: string;
  category: string;
  fabricType: string;
  uom: string;
  minStock: number | null;
  colours: string[];
  status: 'Active' | 'Inactive';
}

export function MaterialList() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([materialsApi.list(), materialCategoriesApi.list(), uomsApi.list(), materialVariantsApi.list()])
      .then(([mats, cats, uoms, variants]) => {
        if (!active) return;
        const cat = new Map(cats.map(c => [c._id, c.name]));
        const uom = new Map(uoms.map(u => [u._id, u.code]));
        setMaterials(mats.map(m => ({
          id: m._id,
          name: m.name,
          category: cat.get(m.categoryId) ?? '—',
          fabricType: m.fabricType ?? '',
          uom: uom.get(m.baseUomId) ?? '—',
          minStock: m.minStockQty ?? null,
          colours: variants.filter(v => v.materialId?._id === m._id).map(v => v.colourId?.name ?? '').filter(Boolean),
          status: m.isActive ? 'Active' : 'Inactive',
        })));
      })
      .catch(err => active && setError(problemMessage(err, 'Could not load materials.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const q = searchTerm.toLowerCase();
  const filteredMaterials = materials.filter(m =>
    m.name.toLowerCase().includes(q) || m.category.toLowerCase().includes(q) || m.colours.some(c => c.toLowerCase().includes(q))
  );

  const columns = [
    { header: 'Material Name', accessor: 'name' as keyof MaterialRow },
    { header: 'Category', accessor: (row: MaterialRow) => row.fabricType ? `${row.category} · ${row.fabricType}` : row.category },
    {
      header: 'Colours',
      accessor: (row: MaterialRow) => row.colours.length
        ? <span className="text-sm text-slate-700">{row.colours.slice(0, 4).join(', ')}{row.colours.length > 4 ? ` +${row.colours.length - 4}` : ''}</span>
        : <span className="text-xs text-slate-400">none yet</span>,
    },
    { header: 'Base Unit', accessor: 'uom' as keyof MaterialRow },
    { header: 'Min Stock', accessor: (row: MaterialRow) => row.minStock !== null ? `${row.minStock.toLocaleString('en-IN')} ${row.uom}` : '—' },
    {
      header: 'Status',
      accessor: (row: MaterialRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${row.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {row.status}
        </span>
      )
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Materials</h1>
          <p className="text-muted">Raw materials, their colours (variants), unit and minimum stock level.</p>
        </div>
        <Can perm="materials.edit">
          <Button className="w-full sm:w-auto" onClick={() => navigate('/inventory/materials/new')}>
            <Plus size={16} /> Add Material
          </Button>
        </Can>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <DataTable
        columns={columns}
        data={filteredMaterials}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, category or colour..."
        emptyMessage="No materials yet. Add your first material."
        onRowClick={(row: MaterialRow) => navigate(`/inventory/materials/${row.id}`)}
      />
    </div>
  );
}
