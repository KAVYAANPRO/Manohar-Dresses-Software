import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Plus, Bell, MessageCircle } from 'lucide-react';
import { formatAmountWithExpenses } from '../../lib/format/money';
import { invoicesApi, companyApi, payStatusLabel, apiErrorMessage, fmtDate } from '../../lib/api/sales';
import { ErrorBanner } from './shared';
import { WhatsAppShareDialog } from '../../components/feedback/WhatsAppShareDialog';
import { RestrictedValue } from '../../lib/permissions/Can';
import { AnimatedNumber } from '../../components/motion';
import { EmptyState, EmptyRow, FilterPills, MobileCard, MobileList, StatGrid, StatItem, StatTile } from '../pageKit';

interface Invoice {
  id: string;
  invoiceNo: string;
  date: string;
  soNo: string;
  customer: string;
  /** Includes tax, but NOT expenses — see `expenses` ("Expenses (if any)": transport etc.). */
  total: number;
  expenses?: number;
  paidAmt: number;
  balanceAmt: number;
  paymentStatus: 'Unpaid' | 'Partially Paid' | 'Paid' | 'Draft' | 'Cancelled';
  type: 'B2B' | 'B2C';
}


const payStatusCfg: Record<Invoice['paymentStatus'], { cls: string }> = {
  Unpaid: { cls: 'bg-red-100 text-red-700' },
  'Partially Paid': { cls: 'bg-amber-100 text-amber-700' },
  Paid: { cls: 'bg-green-100 text-green-700' },
  Draft: { cls: 'bg-slate-100 text-slate-600' },
  Cancelled: { cls: 'bg-slate-200 text-slate-500 line-through' },
};

function inr(n?: number | null) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceList() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [payFilter, setPayFilter] = useState<'All' | Invoice['paymentStatus']>('All');

  const [error, setError] = useState('');
  const [ownerWhatsapp, setOwnerWhatsapp] = useState<string | undefined>();
  useEffect(() => {
    companyApi.get().then(c => setOwnerWhatsapp(c.ownerWhatsapp)).catch(() => undefined);
    invoicesApi.list()
      .then(rows => setInvoices(rows.map(i => ({
        id: i._id,
        invoiceNo: i.status === 'DRAFT' ? 'Draft' : i.docNo,
        date: fmtDate(i.docDate),
        soNo: i.salesOrderNo ?? '—',
        customer: i.customerName,
        total: i.grandTotal - (i.otherCharges ?? 0),
        expenses: i.otherCharges || undefined,
        paidAmt: i.paidAmount + i.creditedAmount,
        balanceAmt: i.status === 'CONFIRMED' ? i.outstanding : 0,
        paymentStatus: (i.status === 'CONFIRMED' ? payStatusLabel[i.paymentStatus] : i.status === 'DRAFT' ? 'Draft' : 'Cancelled') as Invoice['paymentStatus'],
        type: (i.customerGstinSnapshot ? 'B2B' : 'B2C') as Invoice['type'],
      }))))
      .catch(e => setError(apiErrorMessage(e, 'Could not load invoices.')))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = invoices.filter(i =>
    (payFilter === 'All' || i.paymentStatus === payFilter) &&
    (i.invoiceNo.toLowerCase().includes(search.toLowerCase()) ||
      i.customer.toLowerCase().includes(search.toLowerCase()) ||
      i.soNo.toLowerCase().includes(search.toLowerCase()))
  );

  const [reminderOpen, setReminderOpen] = useState(false);
  const overdueInvoices = invoices.filter(i => i.paymentStatus === 'Unpaid' || i.paymentStatus === 'Partially Paid');
  const totalPending = overdueInvoices.reduce((s, i) => s + i.balanceAmt, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500">Tax invoices with GST breakdown. B2B invoices show GSTIN and supply state.</p>
        </div>
        <button
          onClick={() => navigate('/sales/invoices/new')}
          className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]"
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      <ErrorBanner message={error} />

      {!isLoading && overdueInvoices.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <Bell size={15} className="text-amber-500 shrink-0" />
            <span><strong>{overdueInvoices.length}</strong> invoice{overdueInvoices.length > 1 ? 's' : ''} outstanding, totalling <strong><RestrictedValue perm="invoices.rate.view">{inr(totalPending)}</RestrictedValue></strong>.</span>
          </div>
          <button onClick={() => setReminderOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-3 py-1.5 bg-white border border-amber-300 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-100">
            <MessageCircle size={13} /> Notify Owner on WhatsApp
          </button>
        </div>
      )}

      {/* Summary */}
      <StatGrid>
        {[
          { label: 'Total Invoiced', value: invoices.filter(i => i.paymentStatus !== 'Draft' && i.paymentStatus !== 'Cancelled').reduce((s, i) => s + i.total + (i.expenses || 0), 0), cls: 'text-slate-900' },
          { label: 'Collected + credited', value: invoices.reduce((s, i) => s + i.paidAmt, 0), cls: 'text-green-700' },
          { label: 'Pending', value: totalPending, cls: 'text-red-600' },
          { label: 'Invoices', value: invoices.length, cls: 'text-slate-900' },
        ].map(s => (
          <StatItem key={s.label}>
            <StatTile label={s.label} valueClass={s.cls}>
              {s.label === 'Invoices' ? <AnimatedNumber value={s.value} /> : <RestrictedValue perm="invoices.rate.view"><AnimatedNumber value={s.value} format={inr} /></RestrictedValue>}
            </StatTile>
          </StatItem>
        ))}
      </StatGrid>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[200px] max-w-full sm:max-w-sm">
          <input
            type="text"
            placeholder="Search by invoice no., customer, SO..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <FilterPills options={['All', 'Unpaid', 'Partially Paid', 'Paid'] as const} value={payFilter as 'All'} onChange={setPayFilter} className="basis-full sm:basis-auto" />
      </div>

      {/* Table */}
      {/* Mobile cards */}
      <MobileList>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText} message={search || payFilter !== 'All' ? 'No invoices match your filters.' : 'No invoices yet.'} />
        ) : filtered.map(inv => (
          <MobileCard key={inv.id} onClick={() => navigate(`/sales/invoices/${inv.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-[#B80037] text-sm break-all">{inv.invoiceNo}</div>
                <div className="font-medium text-slate-900 text-sm break-words">{inv.customer}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${payStatusCfg[inv.paymentStatus].cls}`}>{inv.paymentStatus}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{inv.date}</div></div>
              <div><div className="text-xs font-medium text-muted">SO No.</div><div className="font-mono text-xs text-slate-600 break-all">{inv.soNo}</div></div>
              <div className="col-span-2"><div className="text-xs font-medium text-muted">Total</div><div className="font-semibold text-slate-900"><RestrictedValue perm="invoices.rate.view">{formatAmountWithExpenses(inv.total, inv.expenses)}</RestrictedValue></div></div>
              <div><div className="text-xs font-medium text-muted">Paid</div><div className="font-medium text-green-700"><RestrictedValue perm="invoices.rate.view">{inr(inv.paidAmt)}</RestrictedValue></div></div>
              <div><div className="text-xs font-medium text-muted">Balance</div><div className="font-medium text-red-600"><RestrictedValue perm="invoices.rate.view">{inr(inv.balanceAmt)}</RestrictedValue></div></div>
            </div>
          </MobileCard>
        ))}
      </MobileList>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Invoice No.', 'Date', 'SO No.', 'Customer', 'Total', 'Paid', 'Balance', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">
                  {Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <EmptyRow colSpan={9} icon={FileText} message="No invoices found." />
            ) : filtered.map(inv => {
              const cfg = payStatusCfg[inv.paymentStatus];
              return (
                <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sales/invoices/${inv.id}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{inv.invoiceNo}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.date}</td>
                  <td className="px-4 py-3 font-mono text-slate-600 text-xs">{inv.soNo}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{inv.customer}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap"><RestrictedValue perm="invoices.rate.view">{formatAmountWithExpenses(inv.total, inv.expenses)}</RestrictedValue></td>
                  <td className="px-4 py-3 font-medium text-green-700"><RestrictedValue perm="invoices.rate.view">{inr(inv.paidAmt)}</RestrictedValue></td>
                  <td className="px-4 py-3 font-medium text-red-600"><RestrictedValue perm="invoices.rate.view">{inr(inv.balanceAmt)}</RestrictedValue></td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${cfg.cls}`}>{inv.paymentStatus}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={e => { e.stopPropagation(); navigate(`/sales/invoices/${inv.id}`); }}
                      className="flex items-center gap-1 text-xs text-[#E40043] hover:text-[#8F002B] font-medium">
                      <FileText size={13} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <WhatsAppShareDialog
        open={reminderOpen}
        title="Notify Owner of Outstanding Payments"
        defaultNumber={ownerWhatsapp}
        message={`Payment reminder — ${overdueInvoices.length} invoice${overdueInvoices.length > 1 ? 's' : ''} outstanding, totalling ${inr(totalPending)}:\n\n${overdueInvoices.map(i => `${i.invoiceNo} — ${i.customer} — ${inr(i.balanceAmt)} due`).join('\n')}`}
        onClose={() => setReminderOpen(false)}
      />
    </div>
  );
}
