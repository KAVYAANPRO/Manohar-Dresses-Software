import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ArrowLeft } from 'lucide-react';
import { customersApi } from '../../../lib/api/customers';
import { agentsApi, type AgentRecord } from '../../../lib/api/sales';
import { AgentPickerField, GST_STATE_CODES, StatePickerField, notifySavedOffline } from '../../sales/shared';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';
import { useDraft } from '../../../lib/drafts/useDraft';
import { DraftBanner } from '../../../components/feedback/DraftBanner';

const CITY_PREFIX = /^\[city:([^\]]*)\]\s*/;

export function CustomerForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    mobile: '',
    email: '',
    gstin: '',
    paymentTerms: 'Net 30',
    defaultDiscount: '',
    city: '',
    billingAddress: '',
    shippingAddress: '',
    status: 'Active' as 'Active' | 'Inactive',
    state: '',
    agentId: '',
  });
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  useEffect(() => { agentsApi.list().then(setAgents).catch(() => undefined); }, []);
  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Draft (new customer only): kept on this device until saved or discarded.
  const draftValue = useMemo(() => formData, [formData]);
  const draft = useDraft('customer:new', draftValue, d => setFormData(d), {
    enabled: !isEdit,
    isEmpty: v => !v.name && !v.businessName && !v.mobile && !v.email && !v.gstin && !v.city && !v.billingAddress && !v.shippingAddress && !v.agentId,
  });

  useEffect(() => {
    if (isEdit && id) {
      customersApi.get(id)
        .then(c => {
          const cityMatch = c.billingAddress?.match(CITY_PREFIX);
          setFormData({
            name: c.name,
            businessName: c.businessName ?? '',
            mobile: c.mobile ?? '',
            email: c.email ?? '',
            gstin: c.gstin ?? '',
            paymentTerms: c.paymentTerms ?? 'Net 30',
            defaultDiscount: c.defaultDiscountPct != null ? String(c.defaultDiscountPct) : '',
            city: cityMatch?.[1] ?? '',
            billingAddress: c.billingAddress?.replace(CITY_PREFIX, '') ?? '',
            shippingAddress: c.shippingAddress ?? '',
            status: c.isActive ? 'Active' : 'Inactive',
            state: c.state ?? '',
            agentId: (c as { agentId?: string | null }).agentId ?? '',
          });
        })
        .catch(() => setSaveError('Could not load this customer.'))
        .finally(() => setIsLoading(false));
    }
  }, [isEdit, id]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Customer name is required.';
    if (!formData.mobile.trim()) errs.mobile = 'Mobile number is required.';
    else if (!/^\d{10}$/.test(formData.mobile)) errs.mobile = 'Enter a valid 10-digit mobile number.';
    if (formData.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gstin))
      errs.gstin = 'Enter a valid GSTIN.';
    if (!formData.state) errs.state = 'State is required for GST (CGST+SGST vs IGST).';
    else if (formData.gstin && GST_STATE_CODES[formData.gstin.slice(0, 2)] && GST_STATE_CODES[formData.gstin.slice(0, 2)] !== formData.state)
      errs.state = `GSTIN is registered in ${GST_STATE_CODES[formData.gstin.slice(0, 2)]}.`;
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setIsSaving(true);
    setSaveError('');
    const payload = {
      name: formData.name,
      businessName: formData.businessName || undefined,
      mobile: formData.mobile || undefined,
      email: formData.email || undefined,
      gstin: formData.gstin || undefined,
      paymentTerms: formData.paymentTerms || undefined,
      defaultDiscountPct: formData.defaultDiscount ? Number(formData.defaultDiscount) : undefined,
      billingAddress: `${formData.city ? `[city:${formData.city}] ` : ''}${formData.billingAddress}`.trim() || undefined,
      shippingAddress: formData.shippingAddress || undefined,
      state: formData.state || undefined,
      agentId: formData.agentId || null,
    };
    try {
      if (isEdit && id) {
        await customersApi.update(id, payload);
        await customersApi.setActive(id, formData.status === 'Active');
      } else {
        // No internet: saved on this device and sent automatically (same Idempotency-Key) when back online.
        const res = await submitOrQueue({
          method: 'POST',
          url: '/customers',
          body: payload,
          label: `Customer · ${formData.businessName || formData.name}${formData.mobile ? ` · ${formData.mobile}` : ''}`,
        });
        draft.clear();
        if (res.queued) notifySavedOffline('this customer');
      }
      navigate('/masters/customers');
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string; title?: string } } }).response?.data;
      setSaveError(message?.detail ?? message?.title ?? 'Could not save this customer.');
    } finally {
      setIsSaving(false);
    }
  };

  const textareaClass = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E40043]';
  const sectionClass = 'bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4';

  if (isLoading) {
    return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/masters/customers')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">{isEdit ? 'Edit Customer' : 'Add Customer'}</h1>
          <p className="text-sm text-slate-500">{isEdit ? 'Update customer details.' : 'Create a new customer account.'}</p>
        </div>
      </div>

      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); window.location.reload(); }} />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Basic Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Contact Name" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Rahul Mehta" error={errors.name} required />
            <Input label="Business / Trade Name" value={formData.businessName} onChange={e => setFormData(f => ({ ...f, businessName: e.target.value }))} placeholder="e.g. Mehta Fashion House" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Mobile Number" type="tel" value={formData.mobile} onChange={e => setFormData(f => ({ ...f, mobile: e.target.value }))} placeholder="10-digit mobile" error={errors.mobile} required />
            <Input label="Email" type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" />
          </div>
        </div>

        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">GST & Payment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="GSTIN" value={formData.gstin} onChange={e => { const g = e.target.value.toUpperCase(); setFormData(f => ({ ...f, gstin: g, state: GST_STATE_CODES[g.slice(0, 2)] ?? f.state })); }} placeholder="e.g. 27AADCM2230M1Z2" error={errors.gstin} />
            <div className="flex flex-col gap-1">
              <StatePickerField
                label={<span className="text-sm font-medium text-slate-700">State (place of supply) *</span>}
                value={formData.state}
                onChange={s => setFormData(f => ({ ...f, state: s }))}
              />
              {errors.state && <span className="text-xs text-red-600">{errors.state}</span>}
            </div>
            <AgentPickerField
              label={<span className="text-sm font-medium text-slate-700">Sales Agent</span>}
              agents={agents.filter(a => a.isActive || a._id === formData.agentId)}
              value={formData.agentId}
              onChange={a => setFormData(f => ({ ...f, agentId: a?._id ?? '' }))}
              onAdded={a => setAgents(prev => [...prev, a])}
            />
            <ChoiceChips
              className="md:col-span-2"
              label={<span className="text-sm font-medium text-slate-700">Payment Terms</span>}
              value={formData.paymentTerms}
              options={['Advance', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'].map(t => ({ value: t, label: t }))}
              onChange={t => setFormData(f => ({ ...f, paymentTerms: t }))}
            />
          </div>
          <Input label="Default Discount (%)" type="number" inputMode="decimal" value={formData.defaultDiscount} onChange={e => setFormData(f => ({ ...f, defaultDiscount: e.target.value }))} placeholder="0" />
        </div>

        <div className={sectionClass}>
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Addresses</h2>
          <Input label="City" value={formData.city} onChange={e => setFormData(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Bengaluru" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Billing Address</label>
            <textarea className={textareaClass} rows={3} value={formData.billingAddress} onChange={e => setFormData(f => ({ ...f, billingAddress: e.target.value }))} placeholder="Full billing address..." />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Shipping Address</label>
            <textarea className={textareaClass} rows={3} value={formData.shippingAddress} onChange={e => setFormData(f => ({ ...f, shippingAddress: e.target.value }))} placeholder="Leave blank if same as billing..." />
          </div>
        </div>

        <ChoiceChips
          label={<span className="text-sm font-medium text-slate-700">Status</span>}
          value={formData.status}
          options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
          onChange={s => setFormData(f => ({ ...f, status: s }))}
        />

        {saveError && <p className="text-sm text-red-600">{saveError}</p>}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={isSaving}>{isEdit ? 'Update Customer' : 'Create Customer'}</Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/customers')}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
