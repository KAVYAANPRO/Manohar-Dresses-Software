import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ArrowLeft } from 'lucide-react';
import { masterCrudApi } from '../../../lib/api/masterCrud';

interface ProcessingType {
  _id: string;
  name: string;
  isActive: boolean;
}

const api = masterCrudApi<ProcessingType>('/processing-types');

export function ProcessForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);

  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (!isEditing) return;
    api.get(id!)
      .then(r => setName(r.name))
      .catch(() => setApiError('Failed to load process.'))
      .finally(() => setIsLoading(false));
  }, [isEditing, id]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError('Process name is required.'); return; }
    setNameError('');
    setApiError('');
    setIsSaving(true);
    try {
      if (isEditing) {
        await api.update(id!, { name: name.trim() });
      } else {
        await api.create({ name: name.trim() });
      }
      navigate('/masters/processes');
    } catch {
      setApiError('Failed to save. Please try again.');
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
        <button onClick={() => navigate('/masters/processes')} className="icon-btn">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold">{isEditing ? 'Edit Process' : 'New Process'}</h1>
          <p className="text-muted">Define a processing type name for use in job slips.</p>
        </div>
      </div>

      {apiError && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{apiError}</p>}

      <form onSubmit={handleSubmit}>
        <Card className="flex flex-col gap-4">
          <Input
            label="Process Name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Stitching, Cutting, Embroidery"
            error={nameError}
            required
          />

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-4 pt-4 border-t border-[var(--color-border)]">
            <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/masters/processes')}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" type="submit" isLoading={isSaving}>
              {isEditing ? 'Update Process' : 'Save Process'}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
