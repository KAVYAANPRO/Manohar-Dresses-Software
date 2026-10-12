import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { suppliersApi, type SupplierRecord } from '../../../lib/api/suppliers';

type SupplierRow = SupplierRecord & { id: string };

export function SupplierList() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    suppliersApi.list()
      .then(list => setSuppliers(list.map(s => ({ ...s, id: s._id }))))
      .catch(() => setLoadError('Could not load suppliers from the server.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.gstin ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { header: 'Supplier Name', accessor: 'name' as keyof SupplierRow },
    { header: 'Contact', accessor: (row: SupplierRow) => [row.contactPerson, row.mobile].filter(Boolean).join(' · ') || '—' },
    { header: 'GSTIN', accessor: (row: SupplierRow) => row.gstin || '—' },
    { header: 'Payment Terms', accessor: (row: SupplierRow) => row.paymentTerms || '—' },
    {
      header: 'Status',
      accessor: (row: SupplierRow) => (
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
          <h1 className="text-xl md:text-2xl font-bold">Suppliers</h1>
          <p className="text-[var(--color-text-muted)]">Manage raw material vendors and dyeing partners.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/procurement/suppliers/new')}>
          <Plus size={16} /> Add Supplier
        </Button>
      </div>
      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search suppliers by name or GSTIN..."
        onRowClick={(row: SupplierRow) => navigate(`/procurement/suppliers/${row.id}`)}
      />
    </div>
  );
}
