import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';
import type { LocationKind, LocationRecord } from './LocationList';



const LOCATION_KINDS: { value: LocationKind; label: string }[] = [
  { value: 'WAREHOUSE', label: 'Warehouse' },
  { value: 'FACTORY_CUSTODY', label: 'Factory / Karigar Custody' },
  { value: 'QUARANTINE', label: 'Quarantine' },
  { value: 'VIRTUAL_SUPPLIER', label: 'Virtual — Supplier' },
  { value: 'VIRTUAL_CUSTOMER', label: 'Virtual — Customer' },
  { value: 'VIRTUAL_PRODUCTION', label: 'Virtual — Production' },
  { value: 'VIRTUAL_LOSS', label: 'Virtual — Loss / Write-off' },
  { value: 'VIRTUAL_ADJUSTMENT', label: 'Virtual — Adjustment' },
];

const api = masterCrudApi<LocationRecord>('/locations');

export function LocationForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState<{ name: string; code: string; kind: LocationKind }>({
    name: '',
    code: '',
    kind: 'WAREHOUSE',
  });
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!isEdit) return;
    api.get(id!)
      .then(r => setFormData({ name: r.name, code: r.code, kind: r.kind }))
      .catch(() => setApiError('Failed to load location.'))
      .finally(() => setIsLoading(false));
  }, [isEdit, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Location name is required.';
    if (!formData.code.trim()) errs.code = 'Location code is required.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSaving(true);
    setApiError('');
    try {
      if (isEdit) {
        await api.update(id!, { name: formData.name.trim() });
      } else {
        await api.create({ name: formData.name.trim(), code: formData.code.trim().toUpperCase(), kind: formData.kind });
      }
      navigate('/masters/locations');
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
        <button onClick={() => navigate('/masters/locations')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEdit ? 'Edit Location' : 'Add Location'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{isEdit ? 'Update location details.' : 'Create a new stock location.'}</p>
        </div>
      </div>

      {apiError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{apiError}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
        <Input
          label="Location Name"
          value={formData.name}
          onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Main Warehouse"
          error={errors.name}
          required
        />
        <Input
          label="Location Code"
          value={formData.code}
          onChange={e => setFormData(f => ({ ...f, code: e.target.value.toUpperCase() }))}
          placeholder="e.g. WH-MAIN"
          error={errors.code}
          required
          disabled={isEdit}
        />
        {isEdit && <p className="text-xs text-[var(--color-text-muted)] -mt-2">Location code cannot be changed after creation.</p>}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">Location Type</label>
          <select
            className={selectClass}
            value={formData.kind}
            onChange={e => setFormData(f => ({ ...f, kind: e.target.value as LocationKind }))}
            disabled={isEdit}
          >
            {LOCATION_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={isSaving}>{isEdit ? 'Update Location' : 'Create Location'}</Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/locations')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
