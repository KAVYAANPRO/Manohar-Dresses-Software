import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface ProcessRow {
  id: string;
  name: string;
  isActive: boolean;
}

const api = masterCrudApi<{ _id: string; name: string; isActive: boolean }>('/processing-types');

export function ProcessList() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.list()
      .then(data => setProcesses(data.map(r => ({ id: r._id, name: r.name, isActive: r.isActive }))))
      .catch(() => setError('Failed to load processing types.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = processes.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'Process Name', accessor: 'name' as keyof ProcessRow },
    {
      header: 'Status',
      accessor: (row: ProcessRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
          row.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
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
          <h1 className="text-xl md:text-2xl font-bold">Processing Types</h1>
          <p className="text-muted">Define processing type names for job slips.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/processes/new')}>
          <Plus size={16} /> Add Process
        </Button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search processes by name..."
        onRowClick={(row) => navigate(`/masters/processes/${row.id}`)}
      />
    </div>
  );
}
