import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { agentsApi, type AgentRecord } from '../../lib/api/sales';
import { problemMessage } from '../../lib/api/procurement';

interface Props {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (agent: AgentRecord) => void;
}

/** Add a sales agent from a customer / sales order without leaving it. Name + mobile are required. */
export function QuickAddAgentSheet({ open, initialName = '', onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [agencyName, setAgencyName] = useState('');
  const [commissionPct, setCommissionPct] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    // A typed search that is all digits is usually the mobile number.
    if (/^\d{6,}$/.test(initialName)) { setMobile(initialName); setName(''); } else { setName(initialName); setMobile(''); }
    setAgencyName(''); setCommissionPct(''); setError('');
  }, [open, initialName]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the agent name.');
    if (!/^\d{10}$/.test(mobile.trim())) return setError('Enter a valid 10-digit mobile number.');
    const pct = Number(commissionPct || 0);
    if (pct < 0 || pct > 100) return setError('Commission must be between 0 and 100.');
    setSaving(true); setError('');
    try {
      const created = await agentsApi.create({
        name: name.trim(),
        mobile: mobile.trim(),
        agencyName: agencyName.trim() || undefined,
        commissionPct: pct,
      });
      onCreated(created);
    } catch (err) {
      setError(problemMessage(err, 'Could not add the agent.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} as="form" onSubmit={submit} ariaLabelledBy="qa-agent-title" className="w-full md:max-w-md md:rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
        <h3 id="qa-agent-title" className="font-semibold text-lg">Add New Agent</h3>
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Agent name <span className="text-red-500">*</span></span>
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Vikram Traders" autoFocus />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Mobile <span className="text-red-500">*</span></span>
          <input className="input-field" type="tel" inputMode="numeric" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="10-digit mobile" />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Agency name</span>
            <input className="input-field" value={agencyName} onChange={e => setAgencyName(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Commission %</span>
            <input className="input-field" type="number" inputMode="decimal" min="0" max="100" step="0.01" value={commissionPct} onChange={e => setCommissionPct(e.target.value)} placeholder="0" />
          </label>
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Add Agent</Button>
        </div>
      </div>
    </ModalShell>
  );
}
