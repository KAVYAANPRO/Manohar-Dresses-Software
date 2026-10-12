import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';
import { notifySavedOffline } from '../../sales/shared';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

interface UomRecord {
  _id: string;
  code: string;
  name: string;
  isActive: boolean;
}

const api = masterCrudApi<UomRecord>('/uoms');

export function UnitForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [formData, setFormData] = useState({ name: '', code: '' });
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  // Draft (new unit only): kept on this device until saved or discarded.
  const draftValue = useMemo(() => formData, [formData]);
  const draft = useDraft('unit:new', draftValue, d => setFormData(d), { enabled: !isEdit, isEmpty: v => !v.name && !v.code });

  useEffect(() => {
    if (!isEdit) return;
    api.get(id!)
      .then(r => setFormData({ name: r.name, code: r.code }))
      .catch(() => setApiError('Failed to load unit.'))
      .finally(() => setIsLoading(false));
  }, [isEdit, id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Unit name is required.';
    if (!formData.code.trim()) errs.code = 'Code / abbreviation is required.';
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSaving(true);
    setApiError('');
    try {
      const payload = { name: formData.name.trim(), code: formData.code.trim().toLowerCase() };
      if (isEdit) {
        await api.update(id!, payload);
      } else {
        // No internet: saved on this device and sent automatically when back online.
        const res = await submitOrQueue({ method: 'POST', url: '/uoms', body: payload, label: `Unit · ${payload.name} (${payload.code})` });
        draft.clear();
        if (res.queued) notifySavedOffline('this unit');
      }
      navigate('/masters/units');
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
        <button onClick={() => navigate('/masters/units')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEdit ? 'Edit Unit' : 'Add Unit'}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{isEdit ? 'Update unit details.' : 'Add a new unit of measure.'}</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />
      {apiError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{apiError}</p>}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
        <Input label="Unit Name" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Metre" error={errors.name} required />
        <Input label="Code / Abbreviation" value={formData.code} onChange={e => setFormData(f => ({ ...f, code: e.target.value }))} placeholder="e.g. m, kg, pcs" error={errors.code} required />
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={isSaving}>{isEdit ? 'Update Unit' : 'Create Unit'}</Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/units')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
