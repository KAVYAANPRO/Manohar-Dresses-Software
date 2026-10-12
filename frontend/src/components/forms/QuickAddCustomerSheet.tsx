import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { customersApi, type CustomerRecord } from '../../lib/api/customers';
import { problemMessage } from '../../lib/api/procurement';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
/** GST state code -> state name (first two digits of a GSTIN). */
const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

interface Props {
  open: boolean;
  initialName?: string;
  onClose: () => void;
  onCreated: (customer: CustomerRecord) => void;
}

/** Add a customer from a sales order / invoice / challan without leaving it. */
export function QuickAddCustomerSheet({ open, initialName = '', onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [gstin, setGstin] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setName(initialName); setMobile(''); setGstin(''); setState(''); setAddress(''); setError(''); } }, [open, initialName]);

  const onGstin = (v: string) => {
    const g = v.toUpperCase();
    setGstin(g);
    if (g.length >= 2 && GST_STATES[g.slice(0, 2)]) setState(GST_STATES[g.slice(0, 2)]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the customer name.');
    const g = gstin.trim();
    if (g && !GSTIN_RE.test(g)) return setError('GSTIN looks wrong — 15 characters like 27ABCDE1234F1Z5 (or leave it blank).');
    setSaving(true); setError('');
    try {
      const created = await customersApi.create({
        name: name.trim(),
        ...(mobile.trim() ? { mobile: mobile.trim() } : {}),
        ...(g ? { gstin: g } : {}),
        ...(state.trim() ? { state: state.trim() } : {}),
        ...(address.trim() ? { billingAddress: address.trim() } : {}),
      });
      onCreated(created as CustomerRecord);
    } catch (err) {
      setError(problemMessage(err, 'Could not add the customer.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} as="form" onSubmit={submit} ariaLabelledBy="qa-customer-title" className="w-full md:max-w-md md:rounded-2xl flex flex-col">
      <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
        <h3 id="qa-customer-title" className="font-semibold text-lg">Add New Customer</h3>
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Customer / shop name <span className="text-red-500">*</span></span>
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Shree Fashion" autoFocus />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Mobile</span>
            <input className="input-field" type="tel" inputMode="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">GSTIN</span>
            <input className="input-field uppercase" value={gstin} onChange={e => onGstin(e.target.value)} maxLength={15} placeholder="optional" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">State <span className="text-muted font-normal">(decides CGST+SGST or IGST)</span></span>
          <input className="input-field" value={state} onChange={e => setState(e.target.value)} placeholder="e.g. Gujarat" list="qa-customer-states" />
          <datalist id="qa-customer-states">{Object.values(GST_STATES).map(s => <option key={s} value={s} />)}</datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Address / city</span>
          <input className="input-field" value={address} onChange={e => setAddress(e.target.value)} placeholder="optional" />
        </label>
        <div className="grid grid-cols-[1fr_2fr] gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={saving}>Add Customer</Button>
        </div>
      </div>
    </ModalShell>
  );
}
