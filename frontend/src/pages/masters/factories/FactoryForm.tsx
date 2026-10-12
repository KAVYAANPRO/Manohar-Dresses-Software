import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import { factoriesApi, FACTORY_SPECIALTIES } from '../../../lib/api/factories';
import { toProblem } from '../../../lib/api/production';
import { notifySavedOffline } from '../../sales/shared';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function FactoryForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [originalActive, setOriginalActive] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    contactPerson: '',
    mobile: '',
    email: '',
    specialty: 'Dyeing',
    address: '',
    gstin: '',
    notes: '',
    status: 'Active',
  });

  // Draft (new factory only): kept on this device until saved or discarded.
  const draftValue = useMemo(() => formData, [formData]);
  const draft = useDraft('factory:new', draftValue, d => setFormData(d), {
    enabled: !isEditing,
    isEmpty: v => !v.name && !v.contactPerson && !v.mobile && !v.email && !v.address && !v.gstin && !v.notes,
  });

  useEffect(() => {
    if (!isEditing || !id) return;
    factoriesApi.get(id)
      .then(f => {
        setFormData({
          name: f.name,
          contactPerson: f.contactPerson ?? '',
          mobile: f.mobile ?? '',
          email: f.email ?? '',
          specialty: f.specialty ?? 'Other',
          address: f.address ?? '',
          gstin: f.gstin ?? '',
          notes: f.notes ?? '',
          status: f.isActive ? 'Active' : 'Inactive',
        });
        setOriginalActive(f.isActive);
      })
      .catch(err => setError(toProblem(err, 'Could not load this factory.').detail))
      .finally(() => setIsLoading(false));
  }, [isEditing, id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (formData.mobile && !/^\d{10}$/.test(formData.mobile)) { setError('Enter a valid 10-digit mobile number.'); return; }
    const gstin = formData.gstin.trim().toUpperCase();
    if (gstin && !GSTIN_RE.test(gstin)) { setError('GSTIN looks invalid (15 characters, e.g. 24ABCDE1234F1Z5).'); return; }
    const body = {
      name: formData.name.trim(),
      contactPerson: formData.contactPerson || undefined,
      mobile: formData.mobile || undefined,
      email: formData.email || undefined,
      specialty: formData.specialty,
      address: formData.address || undefined,
      gstin: gstin || undefined,
      notes: formData.notes || undefined,
    };
    setIsSaving(true);
    try {
      if (isEditing && id) {
        await factoriesApi.update(id, body);
        const wantActive = formData.status === 'Active';
        if (wantActive !== originalActive) await factoriesApi.setActive(id, wantActive);
      } else {
        // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
        const res = await submitOrQueue({
          method: 'POST',
          url: '/job-workers',
          body: { ...body, type: 'FACTORY' },
          label: `Factory · ${body.name}${body.specialty ? ` · ${body.specialty}` : ''}`,
        });
        draft.clear();
        if (res.queued) notifySavedOffline('this factory');
      }
      navigate('/masters/factories');
    } catch (err) {
      setError(toProblem(err, 'Could not save this factory.').detail);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/masters/factories')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Factory' : 'New Factory'}</h1>
          <p className="text-muted">Material issued to this factory is tracked in its own custody location.</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <form onSubmit={handleSubmit}>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Factory Name" name="name" value={formData.name} onChange={handleChange} placeholder="e.g. Krishna Dyeing Works" required />
            <Input label="Contact Person" name="contactPerson" value={formData.contactPerson} onChange={handleChange} placeholder="e.g. Kishore" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Mobile" name="mobile" type="tel" inputMode="numeric" value={formData.mobile} onChange={handleChange} placeholder="10-digit mobile" />
            <Input label="Email" name="email" type="email" value={formData.email} onChange={handleChange} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChoiceChips
              label="Specialty"
              value={formData.specialty}
              options={[
                ...FACTORY_SPECIALTIES.map(s => ({ value: s as string, label: s as string })),
                ...(!FACTORY_SPECIALTIES.includes(formData.specialty as typeof FACTORY_SPECIALTIES[number]) ? [{ value: formData.specialty, label: formData.specialty }] : []),
              ]}
              onChange={s => setFormData(prev => ({ ...prev, specialty: s }))}
            />
            <Input label="GSTIN" name="gstin" value={formData.gstin} onChange={handleChange} placeholder="Needed on delivery challans" />
          </div>
          <Input label="Address" name="address" value={formData.address} onChange={handleChange} placeholder="Complete physical address" />
          {isEditing && (
            <ChoiceChips
              label="Status"
              value={formData.status}
              options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
              onChange={s => setFormData(prev => ({ ...prev, status: s }))}
            />
          )}
          <div className="input-group">
            <label className="input-label">Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} className="input-field min-h-[60px]" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/factories')}>Cancel</Button>
            <Button className="w-full sm:w-auto" type="submit" isLoading={isSaving}>Save Factory</Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
