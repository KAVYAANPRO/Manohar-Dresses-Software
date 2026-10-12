import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import { suppliersApi } from '../../../lib/api/suppliers';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

const EMPTY_SUPPLIER = { name: '', contact: '', gstin: '', address: '', paymentTerms: '', status: 'Active' };

export function SupplierForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [formData, setFormData] = useState(EMPTY_SUPPLIER);
  const [queuedMsg, setQueuedMsg] = useState('');
  const draft = useDraft('supplier:new', formData, setFormData, {
    enabled: !isEditing,
    isEmpty: d => !d.name.trim() && !d.contact.trim() && !d.gstin.trim() && !d.address.trim() && !d.paymentTerms.trim(),
  });

  useEffect(() => {
    if (isEditing && id) {
      suppliersApi.get(id)
        .then(s => {
          setFormData({
            name: s.name,
            contact: [s.contactPerson, s.mobile].filter(Boolean).join(' '),
            gstin: s.gstin ?? '',
            address: s.address ?? '',
            paymentTerms: s.paymentTerms ?? '',
            status: s.isActive ? 'Active' : 'Inactive',
          });
        })
        .catch(() => setSaveError('Could not load this supplier.'))
        .finally(() => setIsLoading(false));
    }
  }, [isEditing, id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveError('');
    const payload = {
      name: formData.name,
      contactPerson: formData.contact || undefined,
      gstin: formData.gstin || undefined,
      address: formData.address || undefined,
      paymentTerms: formData.paymentTerms || undefined,
    };
    try {
      if (isEditing && id) {
        await suppliersApi.update(id, payload);
        await suppliersApi.setActive(id, formData.status === 'Active');
      } else {
        const res = await submitOrQueue({ method: 'POST', url: '/suppliers', body: payload, label: `Supplier · ${payload.name}` });
        draft.clear();
        if (res.queued) {
          setQueuedMsg("Saved on this device — it will be sent when you're back online.");
          window.setTimeout(() => navigate('/procurement/suppliers'), 1800);
          return;
        }
      }
      navigate('/procurement/suppliers');
    } catch (err) {
      const message = (err as { response?: { data?: { detail?: string; title?: string } } }).response?.data;
      setSaveError(message?.detail ?? message?.title ?? 'Could not save this supplier.');
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
        <button onClick={() => navigate('/procurement/suppliers')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Supplier' : 'New Supplier'}</h1>
          <p className="text-muted">Enter the master details for this vendor.</p>
        </div>
      </div>

      {!isEditing && <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setFormData(EMPTY_SUPPLIER); }} />}
      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}

      <form onSubmit={handleSubmit}>
        <Card className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              label="Supplier Name" 
              name="name" 
              value={formData.name} 
              onChange={handleChange} 
              required 
            />
            <Input 
              label="GSTIN" 
              name="gstin" 
              value={formData.gstin} 
              onChange={handleChange} 
              placeholder="e.g. 22AAAAA0000A1Z5"
              required 
            />
          </div>
          
          <Input 
            label="Contact Person & Phone" 
            name="contact" 
            value={formData.contact} 
            onChange={handleChange} 
            required 
          />
          
          <Input 
            label="Address" 
            name="address" 
            value={formData.address} 
            onChange={handleChange} 
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              label="Payment Terms" 
              name="paymentTerms" 
              value={formData.paymentTerms} 
              onChange={handleChange} 
              placeholder="e.g. Net 30, Advance"
            />
            
            <ChoiceChips
              label="Status"
              value={formData.status}
              options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }]}
              onChange={v => setFormData(prev => ({ ...prev, status: v }))}
            />

          </div>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/procurement/suppliers')}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" type="submit" isLoading={isSaving}>
              Save Supplier
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
