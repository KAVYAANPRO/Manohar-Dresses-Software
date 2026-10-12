import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Droplets, PackageCheck, Scissors, Send, Pencil } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Can } from '../../../lib/permissions/Can';
import { toProblem, CHARGE_BASIS_LABEL } from '../../../lib/api/production';
import { materialJobSlipsApi, PART_STAGE_LABEL, type MaterialJobSlipSummary, type MaterialJobSlipPart } from '../../../lib/api/materialJobSlips';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STAGE_CLASS: Record<string, string> = {
  WITH_KARIGAR: 'bg-green-50 text-green-700 border-green-200',
  FORWARDED: 'bg-green-50 text-green-700 border-green-200',
  PARTLY_FORWARDED: 'bg-amber-50 text-amber-700 border-amber-200',
  PROCESSED: 'bg-blue-50 text-blue-700 border-blue-200',
  AT_PROCESSOR: 'bg-purple-50 text-purple-700 border-purple-200',
  DRAFT: 'bg-slate-50 text-slate-600 border-slate-200',
};

/** Material-based job slip: where every part (Top / Bottom / Dupatta) is right now. */
export function MaterialJobSlipDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [slip, setSlip] = useState<MaterialJobSlipSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => {
    materialJobSlipsApi.summary(id).then(setSlip).catch(err => setError(toProblem(err, 'Could not load the job slip.').detail));
  }, [id]);
  useEffect(load, [load]);

  const forward = async (processingJobId: string) => {
    setBusy(processingJobId);
    setError('');
    try {
      await materialJobSlipsApi.forwardProcessed(processingJobId);
      load();
    } catch (err) {
      setError(toProblem(err, 'Could not send the processed material to the karigar.').detail);
    } finally {
      setBusy('');
    }
  };

  if (!slip) {
    return error
      ? <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      : <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  const partIcon = (p: MaterialJobSlipPart) =>
    p.route === 'PROCESS' ? <Droplets size={18} /> : p.route === 'PROCESSED' ? <Send size={18} /> : <Scissors size={18} />;

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/job-slips')} className="icon-btn w-10 h-10" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">Lot {slip.lotNo ?? slip.docNo}</h1>
          <p className="text-muted text-sm break-words">{slip.karigarName} · {slip.docNo} · {fmtDate(slip.docDate)}</p>
        </div>
        <Can perm="jobslips.edit">
          {!['RECEIVED', 'CLOSED', 'CANCELLED'].includes(slip.status) && (
            <button onClick={() => navigate(`/production/job-slips/${slip.id}/edit`)} className="pressable shrink-0 ml-auto min-h-10 px-3 rounded-lg border border-[var(--color-border)] bg-white text-sm font-semibold flex items-center gap-1.5" aria-label="Edit job slip">
              <Pencil size={16} /> Edit
            </button>
          )}
        </Can>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <Card className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fade-up">
        <div><span className="text-xs text-muted block">Lot No.</span><span className="font-semibold">{slip.lotNo ?? '—'}</span></div>
        <div><span className="text-xs text-muted block">Challan No.</span><span className="font-semibold">{slip.challanNo ?? '—'}</span></div>
        <div><span className="text-xs text-muted block">Status</span><span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors capitalize bg-[#FFF0F3] text-[#B80037] transition-colors">{slip.status.replace(/_/g, ' ').toLowerCase()}</span></div>
        <div><span className="text-xs text-muted block">Pieces expected</span><span className="font-semibold">{slip.expectedPieces ?? '—'}</span></div>
        {slip.agreedRate !== undefined && (
          <div><span className="text-xs text-muted block">Rate</span><span className="font-semibold">₹{fmt(slip.agreedRate)} {CHARGE_BASIS_LABEL[slip.chargeBasis]?.toLowerCase()}</span></div>
        )}
        <div><span className="text-xs text-muted block">Design</span><span className="font-semibold">{slip.designId ? (slip.designNo ?? '—') : 'Karigar’s own'}</span></div>
        {slip.instructions && <div className="col-span-2"><span className="text-xs text-muted block">Instructions</span><span>{slip.instructions}</span></div>}
      </Card>

      {slip.makingPlan && slip.makingPlan.some(m => m.expectedPieces !== undefined && m.expectedPieces !== null) && (
        <Card className="flex flex-col gap-3">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Pieces expected</h3>
          {[...new Set(slip.makingPlan.map(m => m.part))].map(part => {
            const rows = slip.makingPlan!.filter(m => m.part === part);
            const total = rows.reduce((a, r) => a + (r.expectedPieces ?? 0), 0);
            return (
              <div key={part} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-semibold text-muted uppercase tracking-wide">
                  <span>{part}{rows[0]?.avgPerPiece ? ` · ${fmt(rows[0].avgPerPiece)} m / piece` : ''}</span>
                  {total > 0 && <span className="text-[#B80037]">{total} pcs</span>}
                </div>
                {rows.filter(r => !r.innerOfColour).map((r, i) => (
                  <div key={i} className="flex flex-col">
                    <div className="flex justify-between text-sm tabular">
                      <span>{r.colourName ?? '—'} <span className="text-muted">({fmt(r.qty)} m · lot {r.lotNo})</span></span>
                      <span className="font-semibold">{r.expectedPieces !== undefined && r.expectedPieces !== null ? `${r.expectedPieces} pcs` : '—'}</span>
                    </div>
                    {rows.filter(x => x.innerOfColour && x.innerOfLotNo === r.lotNo && x.innerOfColour === r.colourName).map((x, j) => (
                      <span key={j} className="text-xs text-muted pl-3">↳ inner {x.colourName} · {fmt(x.qty)} m (lot {x.lotNo})</span>
                    ))}
                  </div>
                ))}
              </div>
            );
          })}
        </Card>
      )}

      <Card className={`flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Material & where it is</h3>
        {slip.parts.length === 0 && <EmptyState message="No material on this slip yet." className="border-0" />}
        {slip.parts.map((p, i) => (
          <div key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-[#FFF0F3] text-[#B80037] flex items-center justify-center">{partIcon(p)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{p.part}</span>
                <span className={`text-xs border rounded-full px-2 py-0.5 ${STAGE_CLASS[p.stage] ?? ''}`}>{PART_STAGE_LABEL[p.stage] ?? p.stage}</span>
              </div>
              <p className="text-sm break-words">{p.material}</p>
              <p className="text-xs text-muted">
                {fmt(p.qty)} m{p.lotNo ? ` · lot ${p.lotNo}` : ''}{p.issueNo ? ` · ${p.issueNo}` : ''}
                {p.processor ? ` · dyer: ${p.processor}` : ''}{p.processingJobNo ? ` (${p.processingJobNo})` : ''}
                {p.forwardedQty ? ` · ${fmt(p.forwardedQty)} m sent to karigar` : ''}
              </p>
            </div>
            {p.processingJobId && (p.stage === 'AT_PROCESSOR') && (
              <Can perm="receiving.edit">
                <Button type="button" variant="secondary" onClick={() => navigate(`/production/processing/${p.processingJobId}`)} className="shrink-0 w-full sm:w-auto">
                  <PackageCheck size={16} /> Receive
                </Button>
              </Can>
            )}
            {p.processingJobId && (p.stage === 'PROCESSED' || p.stage === 'PARTLY_FORWARDED') && (
              <Can perm={['issuance.edit', 'issuance.confirm']}>
                <Button type="button" onClick={() => forward(p.processingJobId!)} isLoading={busy === p.processingJobId} className="shrink-0 w-full sm:w-auto">
                  <Send size={16} /> Send to karigar
                </Button>
              </Can>
            )}
          </div>
        ))}
        <p className="text-xs text-muted">Dyed parts move to the karigar automatically once the dyer’s receipt is confirmed.</p>
      </Card>
    </div>
  );
}
