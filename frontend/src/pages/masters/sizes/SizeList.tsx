import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface SizeRow {
  id: string;
  name: string;
  sortOrder?: number;
  isActive: boolean;
}

const api = masterCrudApi<{ _id: string; name: string; sortOrder?: number; isActive: boolean }>('/sizes');

export function SizeList() {
  const navigate = useNavigate();
  const [sizes, setSizes] = useState<SizeRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.list()
      .then(data => {
        const rows: SizeRow[] = data
          .map(r => ({ id: r._id, name: r.name, sortOrder: r.sortOrder, isActive: r.isActive }))
          .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
        setSizes(rows);
      })
      .catch(() => setError('Failed to load sizes.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = sizes.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'Size Name', accessor: 'name' as keyof SizeRow },
    { header: 'Sort Order', accessor: (row: SizeRow) => row.sortOrder ?? '—' },
    {
      header: 'Status',
      accessor: (row: SizeRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
          row.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Sizes</h1>
          <p className="text-[var(--color-text-muted)]">Manage garment size options (XS, S, M, L, XL, etc.).</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/sizes/new')}>
          <Plus size={16} /> Add Size
        </Button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search sizes..."
        onRowClick={(row) => navigate(`/masters/sizes/${row.id}`)}
      />
    </div>
  );
}
