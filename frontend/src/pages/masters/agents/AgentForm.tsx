import { useState, useEffect, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import { agentsApi, apiErrorMessage, customerLabel, inr, fmtDate, type AgentRecord } from '../../../lib/api/sales';
import { notifySavedOffline } from '../../sales/shared';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

type Summary = Awaited<ReturnType<typeof agentsApi.summary>>;

export function AgentForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    agencyName: '',
    mobileNumber: '',
    commissionPct: '',
    status: 'Active' as 'Active' | 'Inactive',
  });

  // Draft (new agent only): kept on this device until saved or discarded.
  const draftValue = useMemo(() => formData, [formData]);
  const draft = useDraft('agent:new', draftValue, d => setFormData(d), {
    enabled: !isEditing,
    isEmpty: v => !v.name && !v.agencyName && !v.mobileNumber && !v.commissionPct,
  });

  useEffect(() => {
    if (!isEditing || !id) return;
    agentsApi.summary(id)
      .then(s => {
        setSummary(s);
        const a = s.agent;
        setFormData({
          name: a.name,
          agencyName: a.agencyName ?? '',
          mobileNumber: a.mobile,
          commissionPct: a.commissionPct != null ? String(a.commissionPct) : '',
          status: a.isActive ? 'Active' : 'Inactive',
        });
      })
      .catch(e => setSaveError(apiErrorMessage(e, 'Could not load this agent.')))
      .finally(() => setIsLoading(false));
  }, [isEditing, id]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Agent name is required.';
    if (!formData.mobileNumber.trim()) errs.mobileNumber = 'Mobile number is required.';
    else if (!/^\d{10}$/.test(formData.mobileNumber)) errs.mobileNumber = 'Enter a valid 10-digit mobile number.';
    const pct = Number(formData.commissionPct || 0);
    if (pct < 0 || pct > 100) errs.commissionPct = 'Commission must be between 0 and 100.';
    return errs;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setIsSaving(true);
    setSaveError('');
    const payload = {
      name: formData.name.trim(),
      agencyName: formData.agencyName.trim() || undefined,
      mobile: formData.mobileNumber.trim(),
      commissionPct: formData.commissionPct ? Number(formData.commissionPct) : 0,
    };
    try {
      if (isEditing && id) {
        await agentsApi.update(id, payload);
        if ((formData.status === 'Active') !== summary?.agent.isActive) await agentsApi.setActive(id, formData.status === 'Active');
      } else {
        // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
        const res = await submitOrQueue<AgentRecord>({
          method: 'POST',
          url: '/agents',
          body: payload,
          label: `Agent · ${payload.name} · ${payload.mobile}`,
        });
        draft.clear();
        if (res.queued) {
          notifySavedOffline(formData.status === 'Inactive' ? 'this agent (mark it inactive once it has been sent)' : 'this agent');
        } else if (formData.status === 'Inactive') {
          await agentsApi.setActive(res.data._id, false);
        }
      }
      navigate('/masters/agents');
    } catch (err) {
      setSaveError(apiErrorMessage(err, 'Could not save this agent.'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/masters/agents')} className="icon-btn"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Agent' : 'Add Agent'}</h1>
          <p className="text-muted">Link customers to an agent from the customer form; their orders and invoices then carry this agent.</p>
        </div>
      </div>

      {saveError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{saveError}</div>}

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <form onSubmit={handleSubmit}>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Agent Name" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Vikram Traders" error={errors.name} required />
            <Input label="Agency Name (if any)" value={formData.agencyName} onChange={e => setFormData(f => ({ ...f, agencyName: e.target.value }))} placeholder="e.g. Vikram Sales Agency" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Mobile Number" type="tel" value={formData.mobileNumber} onChange={e => setFormData(f => ({ ...f, mobileNumber: e.target.value }))} placeholder="10-digit mobile" error={errors.mobileNumber} required />
            <Input label="Commission % (if any)" type="number" inputMode="decimal" min="0" step="0.01" value={formData.commissionPct} onChange={e => setFormData(f => ({ ...f, commissionPct: e.target.value }))} placeholder="0" error={errors.commissionPct} />
          </div>
          <ChoiceChips
            label="Status"
            value={formData.status}
            options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
            onChange={s => setFormData(f => ({ ...f, status: s }))}
          />
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/agents')}>Cancel</Button>
            <Button className="w-full sm:w-auto" type="submit" isLoading={isSaving}>Save Agent</Button>
          </div>
        </Card>
      </form>

      {summary && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap justify-between gap-2 text-sm">
            <span className="font-semibold">Linked customers ({summary.customers.length})</span>
            <span>Sales {inr(summary.totalSales)} · Commission {inr(summary.totalCommission)}</span>
          </div>
          {summary.customers.length === 0 ? <p className="text-sm text-muted">No customers linked yet.</p> : (
            <div className="flex flex-wrap gap-2">
              {summary.customers.map(c => <Link key={c._id} to={`/masters/customers/${c._id}`} className="px-2 py-1 rounded-full bg-slate-100 text-xs text-slate-700">{customerLabel(c)}</Link>)}
            </div>
          )}
          {summary.invoices.length > 0 && (
            <div className="flex flex-col divide-y divide-slate-100 text-sm">
              {summary.invoices.slice(0, 20).map(i => (
                <Link key={i._id} to={`/sales/invoices/${i._id}`} className="py-2 flex justify-between gap-2">
                  <span className="min-w-0 break-words">{i.docNo} · {i.customerNameSnapshot} · {fmtDate(i.docDate)}</span>
                  <span className="shrink-0">{inr(i.commissionAmount)}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
