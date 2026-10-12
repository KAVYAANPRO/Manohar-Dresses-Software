import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { customersApi, type CustomerRecord } from '../../../lib/api/customers';

type CustomerRow = CustomerRecord & { id: string };

export function CustomerList() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    customersApi.list()
      .then(list => setCustomers(list.map(c => ({ ...c, id: c._id }))))
      .catch(() => setLoadError('Could not load customers from the server.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.businessName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.mobile ?? '').includes(searchTerm) ||
    (c.gstin ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: 'Customer',
      accessor: (row: CustomerRow) => (
        <div>
          <div className="font-medium">{row.name}</div>
          <div className="text-xs text-[var(--color-text-muted)]">{row.businessName}</div>
        </div>
      ),
    },
    { header: 'Mobile', accessor: (row: CustomerRow) => row.mobile || '—' },
    {
      header: 'GSTIN',
      accessor: (row: CustomerRow) => (
        <span className="font-mono text-xs">{row.gstin || '—'}</span>
      ),
    },
    { header: 'Payment Terms', accessor: (row: CustomerRow) => row.paymentTerms || '—' },
    {
      header: 'Status',
      accessor: (row: CustomerRow) => (
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
          <h1 className="text-xl md:text-2xl font-bold">Customers</h1>
          <p className="text-[var(--color-text-muted)]">Manage customer accounts and billing information.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/customers/new')}>
          <Plus size={16} /> Add Customer
        </Button>
      </div>
      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}
      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, business, mobile, or GSTIN..."
        onRowClick={(row) => navigate(`/masters/customers/${row.id}`)}
      />
    </div>
  );
}
