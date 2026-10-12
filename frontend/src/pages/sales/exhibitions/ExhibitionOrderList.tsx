import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Tent } from 'lucide-react';
import { exhibitionsApi, apiErrorMessage, fmtDate } from '../../../lib/api/sales';
import { ErrorBanner } from '../shared';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';

interface ExhibitionOrder {
  id: string;
  orderNo: string;
  exhibitionName: string;
  location?: string;
  date: string;
  customerName: string;
  total: number;
  amountCollected: number;
  status: 'Pending' | 'Completed' | 'Cancelled';
}

function inr(n?: number | null) { return '₹' + (n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
const statusCls: Record<ExhibitionOrder['status'], string> = { Pending: 'bg-amber-100 text-amber-700', Completed: 'bg-green-100 text-green-700', Cancelled: 'bg-slate-100 text-slate-500' };

export function ExhibitionOrderList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ExhibitionOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [error, setError] = useState('');
  useEffect(() => {
    exhibitionsApi.list()
      .then(rows => setOrders(rows.map(o => ({
        id: o._id,
        orderNo: o.docNo,
        exhibitionName: o.exhibitionName,
        location: o.location,
        date: fmtDate(o.docDate),
        customerName: o.customerName,
        total: o.totalAmount,
        amountCollected: o.amountCollected,
        status: o.status === 'CONVERTED' ? 'Completed' : o.status === 'PENDING' ? 'Pending' : 'Cancelled',
      }))))
      .catch(e => setError(apiErrorMessage(e, 'Could not load exhibition orders.')))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = orders.filter(o =>
    o.orderNo.toLowerCase().includes(search.toLowerCase()) ||
    o.exhibitionName.toLowerCase().includes(search.toLowerCase()) ||
    o.customerName.toLowerCase().includes(search.toLowerCase())
  );
  const totalAmt = (o: ExhibitionOrder) => o.total;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2"><Tent size={22} /> Exhibition Orders</h1>
          <p className="text-sm text-slate-500">Orders taken at exhibitions and pop-up events, often to a walk-in customer.</p>
        </div>
        <button onClick={() => navigate('/sales/exhibition-orders/new')} className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]">
          <Plus size={16} /> New Exhibition Order
        </button>
      </div>

      <input type="text" placeholder="Search by order no., exhibition, or customer..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]" />

      <ErrorBanner message={error} />

      {/* Mobile cards */}
      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState message="No exhibition orders found." />
        ) : filtered.map(o => (
          <div key={o.id} className="pressable cursor-pointer w-full text-left flex flex-col gap-2 p-4 bg-white border border-slate-200 rounded-xl shadow-sm active:bg-slate-50" role="button" onClick={() => navigate(`/sales/exhibition-orders/${o.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-[#B80037] text-sm break-all">{o.orderNo}</div>
                <div className="font-medium text-slate-900 text-sm break-words">{o.customerName}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[o.status]}`}>{o.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="col-span-2"><div className="text-xs font-medium text-muted">Exhibition</div><div className="text-slate-700 break-words">{o.exhibitionName}{o.location ? ` — ${o.location}` : ''}</div></div>
              <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{o.date}</div></div>
              <div><div className="text-xs font-medium text-muted">Amount</div><div className="font-semibold text-slate-900">{inr(totalAmt(o))}</div></div>
              <div><div className="text-xs font-medium text-muted">Collected</div><div className="font-medium text-green-700">{inr(o.amountCollected)}</div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Order No.', 'Exhibition', 'Date', 'Customer', 'Amount', 'Collected', 'Status'].map(h => (
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
              <tr><td colSpan={7} className="p-4"><EmptyState message="No exhibition orders found." className="border-0" /></td></tr>
            ) : filtered.map(o => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sales/exhibition-orders/${o.id}`)}>
                <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{o.orderNo}</td>
                <td className="px-4 py-3 text-slate-700">{o.exhibitionName}{o.location ? ` — ${o.location}` : ''}</td>
                <td className="px-4 py-3 text-slate-600">{o.date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{o.customerName}</td>
                <td className="px-4 py-3 font-semibold text-slate-900">{inr(totalAmt(o))}</td>
                <td className="px-4 py-3 text-green-700 font-medium">{inr(o.amountCollected)}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[o.status]}`}>{o.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
