import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Droplets, Scissors } from 'lucide-react';
import { motion } from 'framer-motion';
import { ProcessingBatchForm } from './ProcessingBatchForm';
import { MaterialJobSlipForm } from './MaterialJobSlipForm';
import { spring } from '../../../components/motion';
import { FadeIn } from '../../../components/motion';

const TABS = [
  { key: 'making', label: 'Making', hint: 'Give fabric to the karigar to make garments', icon: Scissors },
  { key: 'processing', label: 'Processing', hint: 'Dyeing & other processes — comes back to the office', icon: Droplets },
] as const;

/** New Job Slip: choose Processing (dyeing etc.) or Making (karigar) at the top. */
export function JobSlipNew() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('type') === 'processing' ? 'processing' : 'making';
  const current = TABS.find(t => t.key === tab)!;

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/job-slips')} className="icon-btn w-10 h-10" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">New Job Slip</h1>
          <p className="text-muted text-sm">{current.hint}</p>
        </div>
      </div>

      <div role="tablist" className="relative grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 border border-[var(--color-border)]">
        {TABS.map(t => {
          const active = t.key === tab;
          const Icon = t.icon;
          return (
            <button key={t.key} role="tab" aria-selected={active} type="button"
              onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('type', t.key); return n; }, { replace: true })}
              className={`relative min-h-12 rounded-lg text-sm md:text-base font-semibold flex items-center justify-center gap-2 transition-colors ${active ? 'text-white' : 'text-slate-600'}`}>
              {active && <motion.span layoutId="job-slip-type" transition={spring.snappy} className="absolute inset-0 rounded-lg bg-[#E40043] shadow-sm" />}
              <Icon size={18} className="relative" />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      <FadeIn key={tab} y={8} duration={0.25}>
        {tab === 'processing' ? <ProcessingBatchForm /> : <MaterialJobSlipForm embedded />}
      </FadeIn>
    </div>
  );
}
