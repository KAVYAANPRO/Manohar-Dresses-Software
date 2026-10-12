import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import { KARIGAR_JOB_TYPES, GST_TYPES, karigarsApi, karigarPayload } from '../../../lib/api/karigars';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

const EMPTY_KARIGAR = {
  fullName: '',
  firmName: '',
  mobileNumber: '',
  jobType: 'Stitching' as (typeof KARIGAR_JOB_TYPES)[number],
  gstType: 'Unregistered' as (typeof GST_TYPES)[number],
  gstNumber: '',
  status: 'Active' as 'Active' | 'Inactive',
};

export function KarigarForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [originalStatus, setOriginalStatus] = useState<'Active' | 'Inactive'>('Active');

  const [formData, setFormData] = useState(EMPTY_KARIGAR);
  const [queuedMsg, setQueuedMsg] = useState('');
  const draft = useDraft('karigar:new', formData, setFormData, {
    enabled: !isEditing,
    isEmpty: d => !d.fullName.trim() && !d.firmName.trim() && !d.mobileNumber.trim() && !d.gstNumber.trim(),
  });

  useEffect(() => {
    if (isEditing && id) {
      karigarsApi.get(id)
        .then(existing => {
          setFormData({
            fullName: existing.fullName,
            firmName: existing.firmName ?? '',
            mobileNumber: existing.mobileNumber,
            jobType: existing.jobType,
            gstType: existing.gstType,
            gstNumber: existing.gstNumber ?? '',
            status: existing.status,
          });
          setOriginalStatus(existing.status);
        })
        .catch(() => setSaveError('Could not load this karigar.'))
        .finally(() => setIsLoading(false));
    }
  }, [isEditing, id]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.fullName.trim()) errs.fullName = 'Full name is required.';
    if (!formData.mobileNumber.trim()) errs.mobileNumber = 'Mobile number is required.';
    else if (!/^\d{10}$/.test(formData.mobileNumber)) errs.mobileNumber = 'Enter a valid 10-digit mobile number.';
    if (formData.gstType === 'Registered' && !formData.gstNumber.trim()) errs.gstNumber = 'GST number is required for a registered karigar.';
    return errs;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSaving(true);
    setSaveError('');
    try {
      if (isEditing && id) {
        await karigarsApi.update(id, formData);
        if (formData.status !== originalStatus) await karigarsApi.setActive(id, formData.status === 'Active');
      } else {
        const res = await submitOrQueue({ method: 'POST', url: '/job-workers', body: karigarPayload(formData), label: `Karigar · ${formData.fullName.trim()}` });
        draft.clear();
        if (res.queued) {
          setQueuedMsg("Saved on this device — it will be sent when you're back online.");
          window.setTimeout(() => navigate('/production/karigars'), 1800);
          return;
        }
      }
      navigate('/production/karigars');
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string; title?: string } } }).response?.data;
      setSaveError(message?.detail ?? message?.title ?? 'Could not save this karigar.');
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
      <div className="flex items-center gap-3 md:gap-4">
        <button onClick={() => navigate('/production/karigars')} className="icon-btn shrink-0">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Karigar' : 'Add Karigar'}</h1>
          <p className="text-muted">Job workers available for job-slip assignment.</p>
        </div>
      </div>

      {!isEditing && <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setFormData(EMPTY_KARIGAR); }} />}
      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}

      <form onSubmit={handleSubmit}>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Full Name"
              value={formData.fullName}
              onChange={e => setFormData(f => ({ ...f, fullName: e.target.value }))}
              placeholder="e.g. Ramesh Bhai"
              error={errors.fullName}
              required
            />
            <Input
              label="Firm Name (if any)"
              value={formData.firmName}
              onChange={e => setFormData(f => ({ ...f, firmName: e.target.value }))}
              placeholder="e.g. Super Stitchers"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Mobile Number"
              type="tel"
              inputMode="tel"
              value={formData.mobileNumber}
              onChange={e => setFormData(f => ({ ...f, mobileNumber: e.target.value }))}
              placeholder="10-digit mobile"
              error={errors.mobileNumber}
              required
            />
            <ChoiceChips
              label="Job Type"
              value={formData.jobType}
              options={KARIGAR_JOB_TYPES.map(t => ({ value: t, label: t }))}
              onChange={v => setFormData(f => ({ ...f, jobType: v }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ChoiceChips
              label="GST Type"
              value={formData.gstType}
              options={GST_TYPES.map(t => ({ value: t, label: t }))}
              onChange={v => setFormData(f => ({ ...f, gstType: v }))}
            />
            <Input
              label="GST Number (optional)"
              value={formData.gstNumber}
              onChange={e => setFormData(f => ({ ...f, gstNumber: e.target.value.toUpperCase() }))}
              placeholder="e.g. 24AABCK1234L1ZP"
              error={errors.gstNumber}
              disabled={formData.gstType === 'Unregistered'}
            />
          </div>

          <ChoiceChips
            label="Status"
            value={formData.status}
            options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
            onChange={v => setFormData(f => ({ ...f, status: v }))}
          />

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button type="button" variant="secondary" onClick={() => navigate('/production/karigars')} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" isLoading={isSaving} className="w-full sm:w-auto">
              Save Karigar
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
