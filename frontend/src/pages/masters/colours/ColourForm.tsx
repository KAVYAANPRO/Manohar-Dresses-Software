import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface ColourRecord {
  _id: string;
  name: string;
  hexCode?: string;
  isActive: boolean;
}

const api = masterCrudApi<ColourRecord>('/colours');

export function ColourForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState({ name: '', hexCode: '#3b82f6' });
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(id!)
      .then(r => setFormData({ name: r.name, hexCode: r.hexCode || '#3b82f6' }))
      .catch(() => setApiError('Failed to load colour.'))
      .finally(() => setIsLoading(false));
  }, [isEdit, id]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Colour name is required.';
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSaving(true);
    setApiError('');
    try {
      const payload = { name: formData.name.trim(), hexCode: formData.hexCode || undefined };
      if (isEdit) {
        await api.update(id!, payload);
      } else {
        await api.create(payload);
      }
      navigate('/masters/colours');
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
        <button
          onClick={() => navigate('/masters/colours')}
          className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEdit ? 'Edit Colour' : 'Add Colour'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{isEdit ? 'Update colour details.' : 'Create a new colour option.'}</p>
        </div>
      </div>

      {apiError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{apiError}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
        <Input
          label="Colour Name"
          value={formData.name}
          onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Navy Blue"
          error={errors.name}
          required
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Hex Value</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={formData.hexCode}
              onChange={e => setFormData(f => ({ ...f, hexCode: e.target.value }))}
              className="w-12 h-10 shrink-0 rounded-lg border border-slate-200 cursor-pointer p-1"
            />
            <div className="flex-1 min-w-0">
              <Input
                value={formData.hexCode}
                onChange={e => setFormData(f => ({ ...f, hexCode: e.target.value }))}
                placeholder="#000000"
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={isSaving}>
            {isEdit ? 'Update Colour' : 'Create Colour'}
          </Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/colours')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
