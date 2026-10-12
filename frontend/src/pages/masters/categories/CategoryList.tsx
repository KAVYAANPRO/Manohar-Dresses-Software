import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface NamedRecord {
  _id: string;
  name: string;
  isActive: boolean;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: 'Material' | 'Product';
  isActive: boolean;
}

const matApi = masterCrudApi<NamedRecord>('/material-categories');
const prodApi = masterCrudApi<NamedRecord>('/product-categories');

export function CategoryList() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'Material' | 'Product'>('All');

  useEffect(() => {
    Promise.all([matApi.list(), prodApi.list()])
      .then(([mat, prod]) => {
        const merged: CategoryRow[] = [
          ...mat.map(r => ({ id: `mat-${r._id}`, name: r.name, type: 'Material' as const, isActive: r.isActive })),
          ...prod.map(r => ({ id: `prod-${r._id}`, name: r.name, type: 'Product' as const, isActive: r.isActive })),
        ];
        setCategories(merged.sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => setError('Failed to load categories.'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = categories.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = filterType === 'All' || c.type === filterType;
    return matchSearch && matchType;
  });

  const columns = [
    { header: 'Category Name', accessor: 'name' as keyof CategoryRow },
    {
      header: 'Type',
      accessor: (row: CategoryRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
          row.type === 'Material' ? 'bg-[#FFDCE5] text-[#8F002B]' : 'bg-purple-100 text-purple-800'
        }`}>
          {row.type}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row: CategoryRow) => (
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
          <h1 className="text-xl md:text-2xl font-bold">Categories</h1>
          <p className="text-[var(--color-text-muted)]">Manage material and product category groups.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/categories/new')}>
          <Plus size={16} /> Add Category
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['All', 'Material', 'Product'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`min-h-10 md:min-h-0 px-3 py-1.5 text-sm rounded-md border transition-colors ${
              filterType === t
                ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                : 'bg-white text-[var(--color-text-main)] border-[var(--color-border)] hover:bg-[var(--color-background)]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search categories..."
        onRowClick={(row) => navigate(`/masters/categories/${row.id}`)}
      />
    </div>
  );
}
