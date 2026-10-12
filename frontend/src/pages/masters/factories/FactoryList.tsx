import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { factoriesApi } from '../../../lib/api/factories';
import { toProblem } from '../../../lib/api/production';

interface Factory {
  id: string;
  name: string;
  contact: string;
  specialty: string;
  address: string;
  status: 'Active' | 'Inactive';
}

export function FactoryList() {
  const navigate = useNavigate();
  const [factories, setFactories] = useState<Factory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    factoriesApi.list()
      .then(list => setFactories(list.map(f => ({
        id: f._id,
        name: f.name,
        contact: [f.contactPerson, f.mobile ? `(${f.mobile})` : ''].filter(Boolean).join(' ') || '—',
        specialty: f.specialty || '—',
        address: f.address || '—',
        status: f.isActive ? 'Active' : 'Inactive',
      }))))
      .catch(err => setLoadError(toProblem(err, 'Could not load factories.').detail))
      .finally(() => setIsLoading(false));
  }, []);

  const q = searchTerm.toLowerCase();
  const filteredFactories = factories.filter(f => f.name.toLowerCase().includes(q) || f.specialty.toLowerCase().includes(q) || f.contact.toLowerCase().includes(q));

  const columns = [
    { header: 'Factory Name', accessor: 'name' as keyof Factory },
    { header: 'Contact', accessor: 'contact' as keyof Factory },
    {
      header: 'Specialty',
      accessor: (row: Factory) => (
        <span className="px-2 py-1 rounded-md text-xs font-medium bg-[#FFDCE5] text-[#8F002B] border border-[#FFB8CA]">{row.specialty}</span>
      ),
    },
    { header: 'Address', accessor: 'address' as keyof Factory },
    {
      header: 'Status',
      accessor: (row: Factory) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${row.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{row.status}</span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Factories</h1>
          <p className="text-muted">Production partner units. Individual karigars are managed under Production &gt; Karigars.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/factories/new')}>
          <Plus size={16} /> Add Factory
        </Button>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <DataTable
        columns={columns}
        data={filteredFactories}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, contact or specialty..."
        emptyMessage="No factories yet."
        onRowClick={(row: Factory) => navigate(`/masters/factories/${row.id}`)}
      />
    </div>
  );
}
