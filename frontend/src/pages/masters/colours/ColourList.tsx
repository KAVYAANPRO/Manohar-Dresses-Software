import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface ColourRow {
  id: string;
  name: string;
  hexCode?: string;
  isActive: boolean;
}

const api = masterCrudApi<{ _id: string; name: string; hexCode?: string; isActive: boolean }>('/colours');

export function ColourList() {
  const navigate = useNavigate();
  const [colours, setColours] = useState<ColourRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.list()
      .then(data => setColours(data.map(r => ({ id: r._id, name: r.name, hexCode: r.hexCode, isActive: r.isActive }))))
      .catch(() => setError('Failed to load colours.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = colours.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: 'Colour',
      accessor: (row: ColourRow) => (
        <div className="flex items-center gap-3">
          <span
            className="inline-block w-5 h-5 rounded-full border border-gray-200 flex-shrink-0"
            style={{ backgroundColor: row.hexCode || '#cccccc' }}
          />
          <span className="font-medium">{row.name}</span>
        </div>
      ),
    },
    { header: 'Hex Value', accessor: (row: ColourRow) => row.hexCode || '—' },
    {
      header: 'Status',
      accessor: (row: ColourRow) => (
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
          <h1 className="text-xl md:text-2xl font-bold">Colours</h1>
          <p className="text-[var(--color-text-muted)]">Manage colour options used for materials and designs.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/colours/new')}>
          <Plus size={16} /> Add Colour
        </Button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search colours..."
        onRowClick={(row) => navigate(`/masters/colours/${row.id}`)}
      />
    </div>
  );
}
