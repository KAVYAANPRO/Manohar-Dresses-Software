import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CreditCard } from 'lucide-react';
import { paymentsApi, invoicesApi, modeLabel, payStatusLabel, apiErrorMessage, fmtDate, inr, type PaymentRow } from '../../lib/api/sales';
import { ErrorBanner } from './shared';
import { EmptyState, STAGGER_CHILDREN, FilterPills } from '../pageKit';
import { AnimatedNumber } from '../../components/motion';

type Pending = Awaited<ReturnType<typeof invoicesApi.pending>>[number];

const modeCls: Record<string, string> = {
  CASH: 'bg-green-100 text-green-700',
  BANK_TRANSFER: 'bg-[#FFDCE5] text-[#B80037]',
  CHEQUE: 'bg-amber-100 text-amber-700',
  UPI: 'bg-purple-100 text-purple-700',
};

export function PaymentList() {
  const navigate = useNavigate();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'Receipts' | 'Pending Invoices'>('Receipts');

  useEffect(() => {
    Promise.all([paymentsApi.list(), invoicesApi.pending()])
      .then(([p, i]) => { setPayments(p); setPending(i); })
      .catch(e => setError(apiErrorMessage(e, 'Could not load payments.')))
      .finally(() => setIsLoading(false));
  }, []);

  const q = search.toLowerCase();
  const filtered = payments.filter(p =>
    (p.docNo ?? '').toLowerCase().includes(q) ||
    (p.customerName ?? '').toLowerCase().includes(q) ||
    p.allocations.some(a => (a.invoiceNo ?? '').toLowerCase().includes(q)),
  );
  const filteredPending = pending.filter(i => i.docNo.toLowerCase().includes(q) || i.customerName.toLowerCase().includes(q));

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);
  const totalUnallocated = payments.reduce((s, p) => s + p.unallocated, 0);
  const totalOutstanding = pending.reduce((s, i) => s + i.outstanding, 0);

  const invoiceLinks = (p: PaymentRow) =>
    p.allocations.length === 0 ? <span className="text-xs text-amber-700">Advance (unallocated)</span> : (
      <div className="flex flex-wrap gap-1">
        {p.allocations.map(a => (
          <button key={a.invoiceId} onClick={() => navigate(`/sales/invoices/${a.invoiceId}`)} className="font-mono text-xs text-[#E40043] hover:underline break-all text-left py-2 -my-1.5 md:py-0 md:my-0">
            {a.invoiceNo}{p.allocations.length > 1 ? ` (${inr(a.amount)})` : ''}
          </button>
        ))}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Payments</h1>
          <p className="text-sm text-slate-500">Payment receipts from customers, and invoices still awaiting payment.</p>
        </div>
        <button onClick={() => navigate('/sales/payments/new')}
          className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]">
          <Plus size={16} /> Record Payment
        </button>
      </div>

      <ErrorBanner message={error} />

      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 ${STAGGER_CHILDREN}`}>
        <div className="col-span-2 sm:col-span-1 bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center"><div className="text-xs text-slate-400 mb-1">Total Collected</div><div className="text-lg md:text-xl break-words font-bold text-slate-900"><AnimatedNumber value={totalCollected} format={inr} /></div></div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 shadow-sm p-4 text-center"><div className="text-xs text-amber-500 mb-1">Unallocated Advances</div><div className="text-lg md:text-xl break-words font-bold text-amber-700"><AnimatedNumber value={totalUnallocated} format={inr} /></div></div>
        <div className="bg-red-50 rounded-xl border border-red-200 shadow-sm p-4 text-center"><div className="text-xs text-red-500 mb-1">Outstanding ({pending.length} invoices)</div><div className="text-lg md:text-xl break-words font-bold text-red-700"><AnimatedNumber value={totalOutstanding} format={inr} /></div></div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[200px] max-w-full sm:max-w-sm">
          <input type="text" placeholder="Search by receipt no., customer, invoice..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]" />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
        </div>
        <FilterPills options={['Receipts', 'Pending Invoices'] as const} value={tab} onChange={setTab} className="basis-full sm:basis-auto" />
      </div>

      {tab === 'Receipts' ? (
        <>
          <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
            {isLoading ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />)
              : filtered.length === 0 ? <EmptyState message="No payments found." />
              : filtered.map(p => (
                <div key={p._id} className="w-full flex flex-col gap-2 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono font-semibold text-[#B80037] text-sm break-all">{p.docNo ?? '—'}</div>
                      <div className="font-medium text-slate-900 text-sm break-words">{p.customerName}</div>
                    </div>
                    <div className="shrink-0 font-bold text-green-700">{inr(p.amount)}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{fmtDate(p.date)}</div></div>
                    <div><div className="text-xs font-medium text-muted">Invoice</div>{invoiceLinks(p)}</div>
                    <div><div className="text-xs font-medium text-muted">Mode</div><span className={`inline-block mt-0.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ${modeCls[p.mode] ?? 'bg-slate-100 text-slate-600'}`}>{modeLabel(p.mode)}</span></div>
                    <div><div className="text-xs font-medium text-muted">Unallocated</div><div className="text-slate-700">{inr(p.unallocated)}</div></div>
                    <div className="col-span-2"><div className="text-xs font-medium text-muted">Reference</div><div className="font-mono text-xs text-slate-500 break-all">{p.reference || '—'}</div></div>
                  </div>
                </div>
              ))}
          </div>
          <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-sm text-left border-collapse">
              <thead><tr className="bg-slate-50 border-b border-slate-200">
                {['Receipt No.', 'Date', 'Customer', 'Invoice', 'Amount', 'Mode', 'Reference', 'Unallocated'].map(h => <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {isLoading ? Array.from({ length: 3 }).map((_, i) => <tr key={i} className="border-b border-slate-100 animate-pulse">{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>)}</tr>)
                  : filtered.length === 0 ? <tr><td colSpan={8} className="p-4"><EmptyState message="No payments found." className="border-0" /></td></tr>
                  : filtered.map(p => (
                    <tr key={p._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{p.docNo ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(p.date)}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{p.customerName}</td>
                      <td className="px-4 py-3">{invoiceLinks(p)}</td>
                      <td className="px-4 py-3 font-bold text-green-700">{inr(p.amount)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${modeCls[p.mode] ?? 'bg-slate-100 text-slate-600'}`}>{modeLabel(p.mode)}</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.reference || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{p.unallocated > 0 ? <span className="text-amber-700">{inr(p.unallocated)}</span> : '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredPending.length === 0 ? <EmptyState message="No invoices awaiting payment." />
            : filteredPending.map(i => (
              <div key={i.invoiceId} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                <div className="pressable cursor-pointer flex-1 min-w-0" role="button" onClick={() => navigate(`/sales/invoices/${i.invoiceId}`)}>
                  <div className="font-mono font-semibold text-[#B80037] text-sm break-all">{i.docNo} <span className="text-xs text-slate-400 font-sans">{fmtDate(i.docDate)}</span></div>
                  <div className="text-sm text-slate-900 break-words">{i.customerName}</div>
                  <div className="text-xs text-slate-500">Total {inr(i.grandTotal)} · Paid {inr(i.allocated)}{i.credited ? ` · Credited ${inr(i.credited)}` : ''} · {payStatusLabel[i.paymentStatus]}</div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3">
                  <div className="font-bold text-red-600">{inr(i.outstanding)}</div>
                  <button onClick={() => navigate(`/sales/payments/new?invoiceId=${i.invoiceId}`)} className="flex items-center gap-1 min-h-[40px] px-3 text-xs font-medium bg-green-600 text-white rounded-lg"><CreditCard size={13} /> Collect</button>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
