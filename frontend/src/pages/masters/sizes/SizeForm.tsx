import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface SizeRecord {
  _id: string;
  name: string;
  sortOrder?: number;
  isActive: boolean;
}

const api = masterCrudApi<SizeRecord>('/sizes');

export function SizeForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState({ name: '', sortOrder: '' });
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(id!)
      .then(r => setFormData({ name: r.name, sortOrder: r.sortOrder?.toString() ?? '' }))
      .catch(() => setApiError('Failed to load size.'))
      .finally(() => setIsLoading(false));
  }, [isEdit, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Size name is required.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSaving(true);
    setApiError('');
    try {
      const payload: { name: string; sortOrder?: number } = { name: formData.name.trim() };
      if (formData.sortOrder) payload.sortOrder = parseInt(formData.sortOrder, 10);
      if (isEdit) {
        await api.update(id!, payload);
      } else {
        await api.create(payload);
      }
      navigate('/masters/sizes');
    } catch {
      setApiError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/masters/sizes')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEdit ? 'Edit Size' : 'Add Size'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{isEdit ? 'Update size details.' : 'Create a new garment size.'}</p>
        </div>
      </div>

      {apiError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{apiError}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
        <Input label="Size Name" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Medium" error={errors.name} required />
        <Input label="Sort Order" type="number" inputMode="numeric" value={formData.sortOrder} onChange={e => setFormData(f => ({ ...f, sortOrder: e.target.value }))} placeholder="e.g. 3 (lower = first in lists)" />
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={isSaving}>{isEdit ? 'Update Size' : 'Create Size'}</Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/sizes')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
