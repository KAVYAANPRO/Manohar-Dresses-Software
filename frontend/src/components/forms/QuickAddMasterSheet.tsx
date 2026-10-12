import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { apiClient } from '../../lib/api/client';
import { problemMessage } from '../../lib/api/procurement';

export interface QuickAddedMaster { _id: string; name: string; code?: string; isActive?: boolean; [k: string]: unknown }

interface QuickAddMasterSheetProps {
  open: boolean;
  /** What is being added, e.g. "material category", "location". */
  noun: string;
  /** Master-crud endpoint, e.g. '/material-categories'. */
  endpoint: string;
  initialName?: string;
  /** Also ask for a short code (locations). */
  withCode?: boolean;
  /** Fixed fields sent with the name, e.g. { kind: 'WAREHOUSE' }. */
  extraBody?: Record<string, unknown>;
  namePlaceholder?: string;
  onClose: () => void;
  onCreated: (record: QuickAddedMaster) => void;
}

const autoCode = (name: string) => name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);

/**
 * Add a simple master record (category, process, location…) from a search page without leaving
 * the form. Only the name (and a code where the record needs one) - the rest is editable later
 * under Masters.
 */
export function QuickAddMasterSheet({ open, noun, endpoint, initialName = '', withCode, extraBody, namePlaceholder, onClose, onCreated }: QuickAddMasterSheetProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialName); setCode(autoCode(initialName)); setCodeEdited(false); setError('');
  }, [open, initialName]);

  const title = `Add ${noun}`;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return setError(`Enter the ${noun} name.`);
    if (withCode && !code.trim()) return setError('Enter a short code.');
    setSaving(true);
    setError('');
    try {
      const { data } = await apiClient.post<QuickAddedMaster>(endpoint, {
        name: name.trim(),
        ...(withCode ? { code: code.trim().toUpperCase() } : {}),
        ...(extraBody ?? {}),
      });
      onCreated(data);
    } catch (err) {
      setError(problemMessage(err, `Could not add the ${noun}.`));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} as="form" onSubmit={submit} ariaLabelledBy="quick-add-master-title" className="w-full md:max-w-md md:rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
        <h3 id="quick-add-master-title" className="font-semibold text-lg first-letter:uppercase">{title}</h3>
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted first-letter:uppercase">{noun} name <span className="text-red-500">*</span></span>
          <input
            className="input-field"
            value={name}
            onChange={e => { setName(e.target.value); if (!codeEdited) setCode(autoCode(e.target.value)); }}
            placeholder={namePlaceholder}
            autoFocus
          />
        </label>
        {withCode && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Short code <span className="text-red-500">*</span></span>
            <input className="input-field uppercase" value={code} onChange={e => { setCode(e.target.value); setCodeEdited(true); }} maxLength={20} />
          </label>
        )}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" isLoading={saving} className="w-full sm:w-auto">{title.replace(/^./, c => c.toUpperCase())}</Button>
        </div>
      </div>
    </ModalShell>
  );
}
