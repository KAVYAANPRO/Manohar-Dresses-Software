import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface NamedRecord {
  _id: string;
  name: string;
  isActive: boolean;
}

const matApi = masterCrudApi<NamedRecord>('/material-categories');
const prodApi = masterCrudApi<NamedRecord>('/product-categories');

/**
 * Route param `:id` is either:
 *   - "new" (the list page navigates here for create)
 *   - "mat-<mongoId>" for editing a material category
 *   - "prod-<mongoId>" for editing a product category
 */
export function CategoryForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const isEdit = !!id && id !== 'new' && id !== undefined;
  const editType: 'Material' | 'Product' | null = isEdit
    ? id!.startsWith('mat-') ? 'Material' : id!.startsWith('prod-') ? 'Product' : null
    : null;
  const realId = isEdit ? id!.replace(/^(mat|prod)-/, '') : undefined;

  const [formData, setFormData] = useState({ name: '', type: 'Material' as 'Material' | 'Product' });
  const [isLoading, setIsLoading] = useState(isEdit && !!realId);
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!isEdit || !realId || !editType) return;
    const api = editType === 'Material' ? matApi : prodApi;
    api.get(realId)
      .then(r => setFormData({ name: r.name, type: editType }))
      .catch(() => setApiError('Failed to load category.'))
      .finally(() => setIsLoading(false));
  }, [isEdit, realId, editType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) { setNameError('Category name is required.'); return; }
    setNameError('');
    setApiError('');
    setIsSaving(true);
    try {
      const api = formData.type === 'Material' ? matApi : prodApi;
      if (isEdit && realId) {
        await api.update(realId, { name: formData.name.trim() });
      } else {
        await api.create({ name: formData.name.trim() });
      }
      navigate('/masters/categories');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setApiError(msg || 'Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E40043]';

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/masters/categories')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEdit ? 'Edit Category' : 'Add Category'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{isEdit ? 'Update category name.' : 'Create a material or product category.'}</p>
        </div>
      </div>

      {apiError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{apiError}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
        {!isEdit && (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-700">Category Type</label>
            <div className="flex gap-4">
              {(['Material', 'Product'] as const).map(t => (
                <label key={t} className="flex items-center gap-2 min-h-10 cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={t}
                    checked={formData.type === t}
                    onChange={() => setFormData(f => ({ ...f, type: t }))}
                    className="w-4 h-4 text-[#E40043]"
                  />
                  <span className="text-sm font-medium text-slate-700">{t} Category</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {isEdit && (
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Category Type</label>
            <select className={selectClass} value={formData.type} disabled>
              <option value="Material">Material Category</option>
              <option value="Product">Product Category</option>
            </select>
            <p className="text-xs text-[var(--color-text-muted)]">Category type cannot be changed after creation.</p>
          </div>
        )}
        <Input
          label="Category Name"
          value={formData.name}
          onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
          placeholder={formData.type === 'Material' ? 'e.g. Fabric' : 'e.g. Salwar Kameez'}
          error={nameError}
          required
        />
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={isSaving}>{isEdit ? 'Update Category' : 'Create Category'}</Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/categories')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
