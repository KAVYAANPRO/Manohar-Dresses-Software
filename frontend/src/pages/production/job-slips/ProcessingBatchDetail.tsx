import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Droplets, PackageCheck } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Can, RestrictedValue } from '../../../lib/permissions/Can';
import { toProblem } from '../../../lib/api/production';
import { processingBatchesApi, type ProcessingBatchDetail as Detail } from '../../../lib/api/processingBatches';
import { todayISO } from '../../../lib/api/procurement';

const fmt = (x: number) => x.toLocaleString('en-IN', { maximumFractionDigits: 3 });
const money = (x?: number) => (x === undefined || x === null ? '—' : `₹${x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const STATUS_CLASS: Record<string, string> = {
  MATERIAL_ISSUED: 'bg-purple-50 text-purple-700 border-purple-200',
  PARTIALLY_RECEIVED: 'bg-amber-50 text-amber-700 border-amber-200',
  RECEIVED: 'bg-green-50 text-green-700 border-green-200',
  CLOSED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

/** Processing job sheet: thans out per colour; receive them back than by than with shrinkage. */
export function ProcessingBatchDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [job, setJob] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState<Record<string, string>>({});
  const [docDate, setDocDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const load = useCallback(() => {
    processingBatchesApi.get(id).then(setJob).catch(err => setError(toProblem(err, 'Could not load the processing job.').detail));
  }, [id]);
  useEffect(load, [load]);

  if (!job) {
    return error
      ? <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
      : <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  const canReceive = ['MATERIAL_ISSUED', 'IN_PROCESS', 'READY', 'PARTIALLY_RECEIVED'].includes(job.status);
  const pending = job.lines.flatMap(l => l.thans.filter(t => t.received === null).map(t => ({ line: l, than: t })));
  const filled = pending.filter(p => entry[p.than.id] !== undefined && entry[p.than.id] !== '');

  /** Live cost/m for a colour from what has been typed so far. */
  const preview = (lineId: string) => {
    const l = job.lines.find(x => x.id === lineId)!;
    const typed = l.thans.filter(t => t.received === null && entry[t.id] !== undefined && entry[t.id] !== '');
    const sent = typed.reduce((a, t) => a + t.sent, 0);
    const recv = typed.reduce((a, t) => a + (Number(entry[t.id]) || 0), 0);
    if (!sent) return null;
    const ratePerM = job.rateBasis === 'PER_METER' ? job.rate ?? 0 : job.sent ? (job.rate ?? 0) / job.sent : 0;
    const total = sent * ((l.costPerMeterBeforeProcessing ?? 0) + ratePerM);
    return { sent, recv, shrink: sent - recv, perM: recv > 0 ? total / recv : undefined };
  };

  const receive = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      const byLine = new Map<string, { thanId: string; received: number }[]>();
      for (const p of filled) {
        const arr = byLine.get(p.line.id) ?? [];
        arr.push({ thanId: p.than.id, received: Number(entry[p.than.id]) || 0 });
        byLine.set(p.line.id, arr);
      }
      const updated = await processingBatchesApi.receive(id, { docDate, lines: [...byLine.entries()].map(([lineId, thans]) => ({ lineId, thans })) });
      setJob(updated);
      setEntry({});
      setDone(`Received ${filled.length} than(s) into the main warehouse.`);
    } catch (err) {
      setError(toProblem(err, 'Could not receive.').detail);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 max-w-5xl pb-24 md:pb-0">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/production/job-slips')} className="icon-btn w-10 h-10" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">{job.processName.charAt(0) + job.processName.slice(1).toLowerCase()} · Lot {job.lotNo ?? job.docNo}</h1>
          <p className="text-muted text-sm truncate">{job.processorName} · {job.docNo} · {fmtDate(job.docDate)}</p>
        </div>
      </div>

      {error && <p className="animate-fade-in text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {done && <p className="animate-fade-in text-green-700 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{done}</p>}

      <Card className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div><span className="text-xs text-muted block">Status</span><span className={`inline-block mt-0.5 text-xs border rounded-full px-2 py-0.5 transition-colors ${STATUS_CLASS[job.status] ?? ''}`}>{job.status.replace(/_/g, ' ').toLowerCase()}</span></div>
        <div><span className="text-xs text-muted block">Parts</span><span className="font-semibold">{job.parts.map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' + ')}</span></div>
        <div><span className="text-xs text-muted block">Challan No.</span><span className="font-semibold">{job.challanNo ?? '—'}</span></div>
        <div><span className="text-xs text-muted block">Thans</span><span className="font-semibold tabular">{job.thansReceived} / {job.thansSent} back</span></div>
        <div><span className="text-xs text-muted block">Sent</span><span className="font-semibold tabular">{fmt(job.sent)} m</span></div>
        <div><span className="text-xs text-muted block">Received</span><span className="font-semibold tabular">{fmt(job.received)} m</span></div>
        <div><span className="text-xs text-muted block">Shrinkage</span><span className="font-semibold tabular">{fmt(job.shrinkage)} m</span></div>
        <RestrictedValue perm="processing.view">
          <div><span className="text-xs text-muted block">Rate · expenses</span><span className="font-semibold tabular">{money(job.rate)}{job.rateBasis === 'PER_METER' ? '/m' : ' job'} · {money(job.expensesPerMeter)}/m</span></div>
        </RestrictedValue>
      </Card>

      {job.lines.map(l => {
        const p = preview(l.id);
        return (
          <Card key={l.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Droplets size={18} className="text-[#E40043] shrink-0" />
                <h3 className="font-semibold text-lg truncate">{l.colourName}</h3>
                {l.lotNo && <span className="text-xs text-muted">from lot {l.lotNo}</span>}
              </div>
              <span className="text-sm tabular text-muted">{fmt(l.received)} / {fmt(l.sent)} m back{l.shrinkage > 0 ? ` · −${fmt(l.shrinkage)} m (${fmt(l.shrinkagePct)}%)` : ''}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {l.thans.map(t => {
                const v = entry[t.id] ?? '';
                const diff = v !== '' ? (Number(v) || 0) - t.sent : null;
                return (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-muted block">Than {t.no} · sent</span>
                      <span className="font-semibold tabular">{fmt(t.sent)} m</span>
                    </div>
                    {t.received !== null ? (
                      <div className="text-right">
                        <span className="text-xs text-muted block">back</span>
                        <span className="font-semibold tabular text-green-700">{fmt(t.received)} m</span>
                        {t.received < t.sent && <span className="text-xs text-amber-700 block tabular">−{fmt(t.sent - t.received)}</span>}
                      </div>
                    ) : canReceive ? (
                      <div className="w-32">
                        <input type="number" inputMode="decimal" min="0" step="any" className="input-field text-right" value={v}
                          onChange={e => setEntry(prev => ({ ...prev, [t.id]: e.target.value }))} placeholder="m back" aria-label={`Than ${t.no} metres received`} />
                        {diff !== null && <span className={`text-xs block text-right tabular ${diff < 0 ? 'text-amber-700' : 'text-muted'}`}>{diff < 0 ? `−${fmt(-diff)} m` : diff > 0 ? `+${fmt(diff)} m` : 'no loss'}</span>}
                      </div>
                    ) : <span className="text-xs text-muted">pending</span>}
                  </div>
                );
              })}
            </div>

            <RestrictedValue perm="processing.view">
              <div className="text-sm tabular flex flex-wrap gap-x-4 gap-y-1 text-muted">
                <span>Before: <b className="text-slate-800">{money(l.costPerMeterBeforeProcessing)}/m</b></span>
                {p && <span>This receipt: {fmt(p.recv)} of {fmt(p.sent)} m → <b className="text-[#B80037]">{p.perM !== undefined ? money(p.perM) : '—'}/m</b></span>}
              </div>
            </RestrictedValue>
          </Card>
        );
      })}

      {job.outputLots.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h3 className="font-semibold text-lg border-b border-[var(--color-border)] pb-2">Back in the warehouse</h3>
          {job.outputLots.map(o => (
            <div key={o.lotId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{o.lotNo}</span>
              <span className="text-muted">{o.partLabels.map(p => p.charAt(0) + p.slice(1).toLowerCase()).join(' + ')} · {o.thans.map(t => `${fmt(t)} m`).join(' + ')}</span>
              <RestrictedValue perm="processing.view"><span className="font-semibold tabular text-[#B80037]">{money(o.unitCost)}/m</span></RestrictedValue>
            </div>
          ))}
          <p className="text-xs text-muted">These lots appear when you create a Making job slip for the karigar, marked with their part and cost.</p>
        </Card>
      )}

      {canReceive && pending.length > 0 && (
        <Can perm={['receiving.edit', 'receiving.confirm']}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 fixed md:sticky bottom-0 inset-x-0 md:inset-x-auto bg-[var(--color-background)]/90 backdrop-blur p-4 border-t border-[var(--color-border)] md:-mx-6 md:px-6 z-20" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted">Received on</span>
              <input type="date" className="input-field w-auto" value={docDate} onChange={e => setDocDate(e.target.value)} />
            </label>
            <Button type="button" onClick={receive} isLoading={busy} disabled={!filled.length} className="w-full sm:w-auto">
              <PackageCheck size={16} /> Receive {filled.length || ''} than{filled.length === 1 ? '' : 's'}
            </Button>
          </div>
        </Can>
      )}
    </div>
  );
}
