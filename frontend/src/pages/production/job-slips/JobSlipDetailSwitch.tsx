import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { jobSlipsApi } from '../../../lib/api/production';
import { JobSlipDetail } from './JobSlipDetail';
import { MaterialJobSlipDetail } from './MaterialJobSlipDetail';
import { ProcessingBatchDetail } from './ProcessingBatchDetail';

/** Material-based slips (no design up front) get the parts view; design-based slips keep the old detail. */
export function JobSlipDetailSwitch() {
  const { id } = useParams<{ id: string }>();
  const [kind, setKind] = useState<'material' | 'design' | 'processing' | null>(null);

  useEffect(() => {
    if (!id) return;
    setKind(null);
    jobSlipsApi.get(id)
      .then(s => {
        const x = s as unknown as { materialBased?: boolean; designId?: string; processing?: unknown };
        setKind(x.processing ? 'processing' : x.materialBased || !s.designId ? 'material' : 'design');
      })
      .catch(() => setKind('design')); // the old page shows its own not-found / error state
  }, [id]);

  if (!id || kind === null) {
    return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }
  if (kind === 'processing') return <ProcessingBatchDetail id={id} />;
  return kind === 'material' ? <MaterialJobSlipDetail id={id} /> : <JobSlipDetail />;
}
