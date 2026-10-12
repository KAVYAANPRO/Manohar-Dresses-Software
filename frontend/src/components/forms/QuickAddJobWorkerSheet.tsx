import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { apiClient } from '../../lib/api/client';
import { problemMessage, idempotencyHeaders } from '../../lib/api/procurement';
import type { JobWorkerLite } from '../../lib/api/production';

interface Props {
  open: boolean;
  initialName?: string;
  /** Default type: ARTISAN (karigar) or FACTORY (e.g. a dyer / unit). */
  defaultType?: 'ARTISAN' | 'FACTORY';
  onClose: () => void;
  onCreated: (worker: JobWorkerLite) => void;
}

/** Add a karigar / factory / dyer without leaving the current form. */
export function QuickAddJobWorkerSheet({ open, initialName = '', defaultType = 'ARTISAN', onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'ARTISAN' | 'FACTORY'>(defaultType);
  const [mobile, setMobile] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setName(initialName); setType(defaultType); setMobile(''); setSpecialty(''); setError(''); } }, [open, initialName, defaultType]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the name.');
    setSaving(true); setError('');
    try {
      const { data } = await apiClient.post<JobWorkerLite>('/job-workers', {
        name: name.trim(), type,
        ...(mobile.trim() ? { mobile: mobile.trim() } : {}),
        ...(specialty.trim() ? { specialty: specialty.trim() } : {}),
      }, idempotencyHeaders());
      onCreated(data);
    } catch (err) {
      setError(problemMessage(err, 'Could not add.'));
    } finally {
      setSaving(false);
    }
  };

  const chip = (on: boolean) => `pressable flex-1 min-h-11 rounded-lg border text-sm font-semibold transition-colors ${on ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white' : 'bg-white border-[var(--color-border)] text-slate-700'}`;

  return (
    <ModalShell open={open} onClose={onClose} as="form" onSubmit={submit} ariaLabelledBy="qa-worker-title" className="w-full md:max-w-md md:rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
        <h3 id="qa-worker-title" className="font-semibold text-lg">Add Karigar / Factory</h3>
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Name <span className="text-red-500">*</span></span>
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Kavyan" autoFocus />
        </label>
        <div className="flex gap-2">
          <button type="button" className={chip(type === 'ARTISAN')} onClick={() => setType('ARTISAN')}>Karigar</button>
          <button type="button" className={chip(type === 'FACTORY')} onClick={() => setType('FACTORY')}>Factory / Dyer</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Mobile</span>
            <input className="input-field" type="tel" inputMode="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Work</span>
            <input className="input-field" value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="e.g. Stitching, Dyeing" />
          </label>
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Add</Button>
        </div>
      </div>
    </ModalShell>
  );
}
