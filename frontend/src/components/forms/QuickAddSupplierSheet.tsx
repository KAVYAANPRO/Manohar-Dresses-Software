import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Button';
import { ModalShell } from '../feedback/ModalShell';
import { suppliersApi, type SupplierRecord } from '../../lib/api/suppliers';
import { problemMessage } from '../../lib/api/procurement';

interface QuickAddSupplierSheetProps {
  open: boolean;
  /** Pre-fills the name (e.g. what was typed in the search page). */
  initialName?: string;
  onClose: () => void;
  onCreated: (supplier: SupplierRecord) => void;
}

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/**
 * Add a supplier without leaving the purchase inward / PO form. Only the name is required;
 * the rest can be completed later under Purchase → Suppliers.
 */
export function QuickAddSupplierSheet({ open, initialName = '', onClose, onCreated }: QuickAddSupplierSheetProps) {
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initialName); setMobile(''); setContactPerson(''); setGstin(''); setAddress(''); setError('');
  }, [open, initialName]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter the supplier name.');
    const g = gstin.trim().toUpperCase();
    if (g && !GSTIN_RE.test(g)) return setError('GSTIN looks wrong — it should be 15 characters like 27ABCDE1234F1Z5 (or leave it blank).');
    if (mobile.trim() && !/^[0-9+\s-]{7,15}$/.test(mobile.trim())) return setError('Enter a valid mobile number (or leave it blank).');
    setSaving(true);
    setError('');
    try {
      const created = await suppliersApi.create({
        name: name.trim(),
        ...(mobile.trim() ? { mobile: mobile.trim() } : {}),
        ...(contactPerson.trim() ? { contactPerson: contactPerson.trim() } : {}),
        ...(g ? { gstin: g } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
      } as Partial<SupplierRecord>);
      onCreated(created);
    } catch (err) {
      setError(problemMessage(err, 'Could not add the supplier.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      as="form"
      onSubmit={submit}
      ariaLabelledBy="quick-add-supplier-title"
      className="w-full md:max-w-md md:rounded-2xl flex flex-col"
    >
      <div className="flex items-center justify-between px-4 pt-2 md:pt-4 pb-2 sticky top-0 z-10 bg-white">
        <h3 id="quick-add-supplier-title" className="font-semibold text-lg">Add New Supplier</h3>
        <button type="button" onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Supplier / party name <span className="text-red-500">*</span></span>
          <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Mahesh Textiles" autoFocus />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Mobile</span>
            <input className="input-field" type="tel" inputMode="tel" value={mobile} onChange={e => setMobile(e.target.value)} placeholder="optional" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Contact person</span>
            <input className="input-field" value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="optional" />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">GSTIN</span>
          <input className="input-field uppercase" value={gstin} onChange={e => setGstin(e.target.value)} placeholder="optional, e.g. 27ABCDE1234F1Z5" maxLength={15} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Address / city</span>
          <input className="input-field" value={address} onChange={e => setAddress(e.target.value)} placeholder="optional" />
        </label>

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
          <Button type="submit" isLoading={saving} className="w-full sm:w-auto">Add Supplier</Button>
        </div>
      </div>
    </ModalShell>
  );
}
