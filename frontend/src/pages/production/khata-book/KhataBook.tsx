import { useState, useEffect, useCallback } from 'react';
import { BookOpen, Plus, ArrowUpCircle, ArrowDownCircle, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import {
  khataApi, jobSlipsApi, toProblem, fmtDate, toDateInput,
  type KhataSummaryRow, type KhataLedger, type KhataLedgerEntry, type PaymentMode, type JobSlipRecord,
} from '../../../lib/api/production';
import { EmptyState, TabFill } from '../../pageKit';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { ChoiceChips } from '../../../components/forms/ChoiceChips';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

function inr(n: number) {
  return '₹ ' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function balanceLabel(bal: number) {
  if (Math.abs(bal) < 0.005) return { text: 'Settled', cls: 'text-slate-400' };
  return bal > 0 ? { text: `Owed: ${inr(bal)}`, cls: 'text-red-600' } : { text: `Advance: ${inr(-bal)}`, cls: 'text-green-600' };
}

const TYPE_LABEL: Record<KhataLedgerEntry['type'], string> = {
  JOB_CHARGE: 'Job Charge Due',
  ADVANCE: 'Advance Given',
  PAYMENT: 'Payment Made',
};

const MODES: { value: PaymentMode; label: string }[] = [
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'OTHER', label: 'Other' },
];

const emptyEntry = () => ({ kind: 'PAYMENT' as 'ADVANCE' | 'PAYMENT', amount: '', mode: 'CASH' as PaymentMode, reference: '', date: toDateInput(new Date().toISOString()), jobSlipId: '', notes: '' });

export function KhataBook() {
  const [rows, setRows] = useState<KhataSummaryRow[]>([]);
  const [filter, setFilter] = useState<'ARTISAN' | 'FACTORY' | 'ALL'>('ALL');
  const [selectedId, setSelectedId] = useState('');
  const [ledger, setLedger] = useState<KhataLedger | null>(null);
  const [slips, setSlips] = useState<JobSlipRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [error, setError] = useState('');

  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState(emptyEntry());
  const [entryError, setEntryError] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<KhataLedgerEntry | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [slipPickerOpen, setSlipPickerOpen] = useState(false);
  const [notice, setNotice] = useState('');

  // An entry being typed is kept on this device if the page is left by mistake.
  const draft = useDraft(
    'khata-entry:new',
    { jobWorkerId: selectedId, open: entryOpen, entry },
    d => { if (d.open && d.jobWorkerId) { setSelectedId(d.jobWorkerId); setEntry({ ...emptyEntry(), ...d.entry }); setEntryOpen(true); } },
    { enabled: !isLoading, isEmpty: d => !d.open || (!d.entry.amount && !d.entry.reference.trim() && !d.entry.notes.trim()) },
  );

  const loadSummary = useCallback(() => {
    return khataApi.summary()
      .then(list => {
        setRows(list);
        setSelectedId(prev => prev || list.find(r => r.isActive)?.jobWorkerId || list[0]?.jobWorkerId || '');
      })
      .catch(err => setError(toProblem(err, 'Could not load the khata book.').detail));
  }, []);

  const loadLedger = useCallback((jobWorkerId: string) => {
    if (!jobWorkerId) { setLedger(null); return; }
    setLedgerLoading(true);
    Promise.all([khataApi.ledger(jobWorkerId), jobSlipsApi.list({ jobWorkerId }).catch(() => [])])
      .then(([l, s]) => { setLedger(l); setSlips(s.filter(x => x.status !== 'CANCELLED')); })
      .catch(err => setError(toProblem(err, 'Could not load this account.').detail))
      .finally(() => setLedgerLoading(false));
  }, []);

  useEffect(() => { loadSummary().finally(() => setIsLoading(false)); }, [loadSummary]);
  useEffect(() => { loadLedger(selectedId); }, [selectedId, loadLedger]);

  const visible = rows.filter(r => filter === 'ALL' || r.type === filter);
  const selected = rows.find(r => r.jobWorkerId === selectedId);
  const totals = ledger?.totals;
  const balance = totals?.balance ?? 0;
  const bl = balanceLabel(balance);

  const saveEntry = async () => {
    setEntryError('');
    const amount = Number(entry.amount);
    if (!(amount > 0)) { setEntryError('Enter an amount above 0.'); return; }
    setSaving(true);
    try {
      const res = await submitOrQueue({
        method: 'POST',
        url: '/khata/payments',
        label: `Khata · ${entry.kind === 'PAYMENT' ? 'Payment' : 'Advance'} ${inr(amount)} · ${selected?.name ?? ''}`.trim(),
        body: {
          jobWorkerId: selectedId,
          kind: entry.kind,
          amount: Math.round(amount * 100) / 100,
          mode: entry.mode,
          reference: entry.reference || undefined,
          jobSlipId: entry.jobSlipId || undefined,
          date: entry.date ? new Date(`${entry.date}T12:00:00`).toISOString() : undefined,
          notes: entry.notes || undefined,
        },
      });
      setEntryOpen(false);
      setEntry(emptyEntry());
      draft.clear();
      if (res.queued) {
        setNotice("Entry saved on this device — it will be sent when you're back online, then the balance updates.");
        return;
      }
      setNotice('');
      await loadSummary();
      loadLedger(selectedId);
    } catch (err) {
      setEntryError(toProblem(err, 'Could not save this entry.').detail);
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await khataApi.cancelPayment(cancelTarget.id, cancelReason.trim());
      setCancelTarget(null);
      setCancelReason('');
      await loadSummary();
      loadLedger(selectedId);
    } catch (err) {
      setError(toProblem(err).detail);
      setCancelTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><BookOpen size={22} /> Khata Book</h1>
          <p className="text-muted">Running account per karigar / factory: job charges earned on received work vs advances and payments made.</p>
        </div>
        <Button onClick={() => { setEntry(emptyEntry()); setEntryError(''); setEntryOpen(true); }} disabled={!selected} className="w-full sm:w-auto">
          <Plus size={16} /> Add Entry
        </Button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}
      {notice && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{notice}</p>}

      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-72 shrink-0 flex flex-col gap-2">
          <div className="flex gap-1">
            {([['ALL', 'All'], ['ARTISAN', 'Karigars'], ['FACTORY', 'Factories']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} className={`relative flex-1 px-2 min-h-10 rounded-lg text-sm font-medium transition-colors pressable ${filter === v ? 'text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{filter === v && <TabFill group="khata" />}<span className="relative">{l}</span></button>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto md:max-h-[70vh]">
            {isLoading && <div className="p-4 text-sm text-slate-400">Loading…</div>}
            {!isLoading && visible.length === 0 && <EmptyState message="No parties yet." className="border-0" />}
            {visible.map(k => {
              const b = balanceLabel(k.balance);
              return (
                <button
                  key={k.jobWorkerId}
                  onClick={() => setSelectedId(k.jobWorkerId)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 transition-colors ${selectedId === k.jobWorkerId ? 'bg-[#FFF0F3]' : 'hover:bg-slate-50'}`}
                >
                  <div className="text-sm font-medium text-slate-900">{k.name}{!k.isActive && <span className="text-xs text-slate-400"> (inactive)</span>}</div>
                  <div className="text-xs text-slate-400">{k.type === 'FACTORY' ? 'Factory' : 'Karigar'}{k.specialty ? ` · ${k.specialty}` : ''}</div>
                  <div className={`text-xs font-semibold mt-1 ${b.cls}`}>{b.text}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-xl overflow-hidden">
          {selected ? (
            <>
              <div className="px-4 md:px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{selected.name}</div>
                  <div className="text-xs text-slate-400">{selected.type === 'FACTORY' ? 'Factory' : 'Karigar'}{selected.specialty ? ` · ${selected.specialty}` : ''}{selected.mobile ? ` · ${selected.mobile}` : ''}</div>
                </div>
                <div className={`text-lg font-bold ${bl.cls}`}>{Math.abs(balance) < 0.005 ? 'Settled' : balance > 0 ? `Owed ${inr(balance)}` : `Advance ${inr(-balance)}`}</div>
              </div>
              {totals && (
                <div className="grid grid-cols-3 gap-2 px-4 md:px-5 py-3 border-b border-slate-100 text-center text-xs">
                  <div><div className="text-slate-400">Earned</div><div className="font-semibold text-slate-800">{inr(totals.earned)}</div></div>
                  <div><div className="text-slate-400">Advances</div><div className="font-semibold text-slate-800">{inr(totals.advances)}</div></div>
                  <div><div className="text-slate-400">Payments</div><div className="font-semibold text-slate-800">{inr(totals.payments)}</div></div>
                </div>
              )}
              {ledgerLoading ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">Loading…</div>
              ) : !ledger || ledger.entries.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-400 text-sm">No entries yet. Job charges appear automatically when received work is confirmed.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {[...ledger.entries].reverse().map(e => {
                    const isCharge = e.type === 'JOB_CHARGE';
                    return (
                      <div key={`${e.type}-${e.id}`} className="px-4 md:px-5 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {isCharge ? <ArrowUpCircle size={16} className="text-red-500 shrink-0" /> : <ArrowDownCircle size={16} className="text-green-600 shrink-0" />}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900">{TYPE_LABEL[e.type]} <span className="text-xs text-slate-400 font-normal">{e.ref}</span></div>
                            <div className="text-xs text-slate-400 break-words">{e.description}</div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-semibold ${isCharge ? 'text-red-600' : 'text-green-600'}`}>{isCharge ? '+' : '−'}{inr(isCharge ? e.credit : e.debit)}</div>
                          <div className="text-xs text-slate-400">{fmtDate(e.date)} · bal {inr(e.balance)}</div>
                          {!isCharge && (
                            <button className="text-xs text-red-500 hover:underline min-h-8" onClick={() => { setCancelReason(''); setCancelTarget(e); }}>Cancel entry</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="px-5 py-10 text-center text-slate-400 text-sm">Select a karigar or factory to view their khata.</div>
          )}
        </div>
      </div>

      {entryOpen && selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">New entry · {selected.name}</h2>
              <button className="icon-btn" onClick={() => setEntryOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setEntry(emptyEntry()); }} />
            <div className="grid grid-cols-2 gap-2">
              {(['PAYMENT', 'ADVANCE'] as const).map(k => (
                <button key={k} type="button" onClick={() => setEntry(x => ({ ...x, kind: k }))} className={`min-h-10 rounded-lg text-sm font-medium border ${entry.kind === k ? 'bg-[#E40043] text-white border-[#E40043]' : 'bg-white text-slate-700 border-slate-200'}`}>
                  {k === 'PAYMENT' ? 'Payment Made' : 'Advance Given'}
                </button>
              ))}
            </div>
            <Input label="Amount (₹)" type="number" inputMode="decimal" min="0" step="0.01" value={entry.amount} onChange={e => setEntry(x => ({ ...x, amount: e.target.value }))} required />
            <ChoiceChips label="Mode" value={entry.mode} options={MODES} onChange={m => setEntry(x => ({ ...x, mode: m }))} />
            <Input label="Date" type="date" value={entry.date} max={toDateInput(new Date().toISOString())} onChange={e => setEntry(x => ({ ...x, date: e.target.value }))} />
            <Input label="Reference" value={entry.reference} onChange={e => setEntry(x => ({ ...x, reference: e.target.value }))} placeholder="UPI ref / cheque no." />
            <PickerField
              label="Against Job Slip (optional)"
              value={slips.find(s => s._id === entry.jobSlipId)?.docNo}
              placeholder="None — tap to choose"
              onOpen={() => setSlipPickerOpen(true)}
            />
            <Input label="Notes" value={entry.notes} onChange={e => setEntry(x => ({ ...x, notes: e.target.value }))} />
            {entryError && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{entryError}</div>}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="secondary" onClick={() => setEntryOpen(false)} className="w-full sm:w-auto">Cancel</Button>
              <Button onClick={saveEntry} isLoading={saving} className="w-full sm:w-auto">Save Entry</Button>
            </div>
          </div>
        </div>
      )}

      <PickerSheet
        open={slipPickerOpen}
        title="Against job slip"
        items={[
          { id: '', title: 'None', subtitle: 'Not against a particular job slip' },
          ...slips.map((s): PickerItem => ({ id: s._id, title: s.docNo, subtitle: [fmtDate(s.docDate), s.status.replace(/_/g, ' ').toLowerCase()].filter(Boolean).join(' · ') })),
        ]}
        selectedId={entry.jobSlipId}
        searchPlaceholder="Search job slip no…"
        emptyText="No job slip for this party."
        onSelect={it => { setEntry(x => ({ ...x, jobSlipId: it.id })); setSlipPickerOpen(false); }}
        onClose={() => setSlipPickerOpen(false)}
      />

      <ConfirmDialog
        open={!!cancelTarget}

        title="Cancel khata entry"
        danger
        impact={
          <div className="flex flex-col gap-2">
            <span>Cancel {cancelTarget?.ref} ({inr(cancelTarget?.debit ?? 0)})? It stays in the audit trail but no longer counts in the balance.</span>
            <input className="input-field" placeholder="Reason (required)" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
          </div>
        }
        confirmLabel="Cancel Entry"
        confirmDisabled={!cancelReason.trim()}
        isLoading={saving}
        onConfirm={doCancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
