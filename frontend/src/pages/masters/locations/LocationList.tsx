import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

export type LocationKind =
  | 'WAREHOUSE'
  | 'FACTORY_CUSTODY'
  | 'QUARANTINE'
  | 'VIRTUAL_SUPPLIER'
  | 'VIRTUAL_CUSTOMER'
  | 'VIRTUAL_PRODUCTION'
  | 'VIRTUAL_LOSS'
  | 'VIRTUAL_ADJUSTMENT';

export interface LocationRecord {
  _id: string;
  code: string;
  name: string;
  kind: LocationKind;
  isActive: boolean;
}

interface LocationRow {
  id: string;
  code: string;
  name: string;
  kind: LocationKind;
  isActive: boolean;
}

const KIND_LABEL: Record<LocationKind, string> = {
  WAREHOUSE: 'Warehouse',
  FACTORY_CUSTODY: 'Factory',
  QUARANTINE: 'Quarantine',
  VIRTUAL_SUPPLIER: 'Virtual (Supplier)',
  VIRTUAL_CUSTOMER: 'Virtual (Customer)',
  VIRTUAL_PRODUCTION: 'Virtual (Production)',
  VIRTUAL_LOSS: 'Virtual (Loss)',
  VIRTUAL_ADJUSTMENT: 'Virtual (Adjustment)',
};

const KIND_COLOR: Partial<Record<LocationKind, string>> = {
  WAREHOUSE: 'bg-[#FFDCE5] text-[#8F002B]',
  FACTORY_CUSTODY: 'bg-orange-100 text-orange-800',
  QUARANTINE: 'bg-red-100 text-red-800',
};

const api = masterCrudApi<LocationRecord>('/locations');

export function LocationList() {
  const navigate = useNavigate();
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.list()
      .then(data => setLocations(data.map(r => ({ id: r._id, code: r.code, name: r.name, kind: r.kind, isActive: r.isActive }))))
      .catch(() => setError('Failed to load locations.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = locations.filter(l =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'Location Name', accessor: 'name' as keyof LocationRow },
    { header: 'Code', accessor: 'code' as keyof LocationRow },
    {
      header: 'Type',
      accessor: (row: LocationRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${KIND_COLOR[row.kind] ?? 'bg-gray-100 text-gray-700'}`}>
          {KIND_LABEL[row.kind] ?? row.kind}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: LocationRow) => (
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
          <h1 className="text-xl md:text-2xl font-bold">Locations</h1>
          <p className="text-[var(--color-text-muted)]">Manage warehouses, factory zones, and storage locations.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/locations/new')}>
          <Plus size={16} /> Add Location
        </Button>
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search locations..."
        onRowClick={(row) => navigate(`/masters/locations/${row.id}`)}
      />
    </div>
  );
}
