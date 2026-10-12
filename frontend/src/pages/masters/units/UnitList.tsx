import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface UomRow {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

const api = masterCrudApi<{ _id: string; code: string; name: string; isActive: boolean }>('/uoms');

export function UnitList() {
  const navigate = useNavigate();
  const [units, setUnits] = useState<UomRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.list()
      .then(data => setUnits(data.map(r => ({ id: r._id, code: r.code, name: r.name, isActive: r.isActive }))))
      .catch(() => setError('Failed to load units.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = units.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'Unit Name', accessor: 'name' as keyof UomRow },
    { header: 'Code / Abbreviation', accessor: 'code' as keyof UomRow },
    {
      header: 'Status',
      accessor: (row: UomRow) => (
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
          <h1 className="text-xl md:text-2xl font-bold">Units of Measure</h1>
          <p className="text-[var(--color-text-muted)]">Manage measurement units for materials and stock.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/units/new')}>
          <Plus size={16} /> Add Unit
        </Button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search units..."
        onRowClick={(row) => navigate(`/masters/units/${row.id}`)}
      />
    </div>
  );
}
