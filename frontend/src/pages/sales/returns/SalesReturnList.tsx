import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { salesReturnsApi, apiErrorMessage, fmtDate } from '../../../lib/api/sales';
import { ErrorBanner } from '../shared';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';

interface SalesReturn {
  id: string;
  returnNo: string;
  date: string;
  customer: string;
  invoiceNo?: string;
  reason: string;
  amount: number;
  status: 'Pending' | 'Credited' | 'Cancelled';
}

function inr(n?: number | null) { return '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
const statusCls: Record<SalesReturn['status'], string> = { Pending: 'bg-amber-100 text-amber-700', Credited: 'bg-green-100 text-green-700', Cancelled: 'bg-slate-100 text-slate-500' };

export function SalesReturnList() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [error, setError] = useState('');
  useEffect(() => {
    salesReturnsApi.list()
      .then(rows => setReturns(rows.map(r => ({
        id: r._id,
        returnNo: r.docNo,
        date: fmtDate(r.docDate),
        customer: r.customerName ?? '',
        invoiceNo: r.invoiceNo,
        reason: r.reason,
        amount: r.creditTotal,
        status: r.status === 'CONFIRMED' ? 'Credited' : r.status === 'DRAFT' ? 'Pending' : 'Cancelled',
      }))))
      .catch(e => setError(apiErrorMessage(e, 'Could not load sales returns.')))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = returns.filter(r => r.returnNo.toLowerCase().includes(search.toLowerCase()) || r.customer.toLowerCase().includes(search.toLowerCase()));
  const totalAmt = (r: SalesReturn) => r.amount;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2"><RotateCcw size={22} /> Sales Returns</h1>
          <p className="text-sm text-slate-500">Goods returned by a customer, credited against an invoice.</p>
        </div>
        <button onClick={() => navigate('/sales/returns/new')} className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]">
          <Plus size={16} /> New Return
        </button>
      </div>

      <input type="text" placeholder="Search by return no. or customer..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]" />

      <ErrorBanner message={error} />

      {/* Mobile cards */}
      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState message="No sales returns found." />
        ) : filtered.map(r => (
          <div key={r.id} className="pressable cursor-pointer w-full text-left flex flex-col gap-2 p-4 bg-white border border-slate-200 rounded-xl shadow-sm active:bg-slate-50" role="button" onClick={() => navigate(`/sales/returns/${r.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-[#B80037] text-sm break-all">{r.returnNo}</div>
                <div className="font-medium text-slate-900 text-sm break-words">{r.customer}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[r.status]}`}>{r.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{r.date}</div></div>
              <div><div className="text-xs font-medium text-muted">Amount</div><div className="font-semibold text-slate-900">{inr(totalAmt(r))}</div></div>
              <div><div className="text-xs font-medium text-muted">Invoice No.</div><div className="font-mono text-xs text-slate-500 break-all">{r.invoiceNo || '—'}</div></div>
              <div className="col-span-2"><div className="text-xs font-medium text-muted">Reason</div><div className="text-slate-600 break-words">{r.reason}</div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Return No.', 'Date', 'Customer', 'Invoice No.', 'Reason', 'Amount', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>)}</tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-4"><EmptyState message="No sales returns found." className="border-0" /></td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sales/returns/${r.id}`)}>
                <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{r.returnNo}</td>
                <td className="px-4 py-3 text-slate-600">{r.date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{r.customer}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.invoiceNo || '—'}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.reason}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{inr(totalAmt(r))}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[r.status]}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
