import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Truck } from 'lucide-react';
import { challansApi, challanStatusLabel, apiErrorMessage, fmtDate, type ChallanStatus } from '../../../lib/api/sales';
import { ErrorBanner } from '../shared';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';

interface DeliveryChallan {
  id: string;
  challanNo: string;
  date: string;
  customer: string;
  soNo?: string;
  transportName?: string;
  lines: { qty: number }[];
  openQty: number;
  status: string;
  rawStatus: ChallanStatus;
}

const statusClsRaw: Record<ChallanStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  DISPATCHED: 'bg-amber-100 text-amber-700',
  PARTIALLY_CLOSED: 'bg-[#FFDCE5] text-[#B80037]',
  CLOSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export function DeliveryChallanList() {
  const navigate = useNavigate();
  const [challans, setChallans] = useState<DeliveryChallan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [error, setError] = useState('');
  useEffect(() => {
    challansApi.list()
      .then(rows => setChallans(rows.map(c => ({
        id: c._id,
        challanNo: c.docNo,
        date: fmtDate(c.docDate),
        customer: c.customerName ?? '',
        soNo: c.salesOrderNo,
        transportName: c.transportName,
        lines: c.lines,
        openQty: c.openQty,
        status: challanStatusLabel[c.status] + (c.openQty > 0 && c.status !== 'DRAFT' && c.status !== 'CANCELLED' ? ` (${c.openQty} out)` : ''),
        rawStatus: c.status,
      }))))
      .catch(e => setError(apiErrorMessage(e, 'Could not load delivery challans.')))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = challans.filter(c =>
    c.challanNo.toLowerCase().includes(search.toLowerCase()) ||
    c.customer.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 flex items-center gap-2"><Truck size={22} /> Delivery Challans</h1>
          <p className="text-sm text-slate-500">Dispatch records — goods sent out, with or without a tax invoice at the time.</p>
        </div>
        <button onClick={() => navigate('/sales/delivery-challans/new')}
          className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]">
          <Plus size={16} /> New Challan
        </button>
      </div>

      <ErrorBanner message={error} />

      <input type="text" placeholder="Search by challan no. or customer..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]" />

      {/* Mobile cards */}
      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState message="No delivery challans found." />
        ) : filtered.map(c => (
          <div key={c.id} className="pressable cursor-pointer w-full text-left flex flex-col gap-2 p-4 bg-white border border-slate-200 rounded-xl shadow-sm active:bg-slate-50" role="button" onClick={() => navigate(`/sales/delivery-challans/${c.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-[#B80037] text-sm break-all">{c.challanNo}</div>
                <div className="font-medium text-slate-900 text-sm break-words">{c.customer}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusClsRaw[c.rawStatus]}`}>{c.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{c.date}</div></div>
              <div><div className="text-xs font-medium text-muted">Items</div><div className="text-slate-700">{c.lines.reduce((s, l) => s + l.qty, 0)} pcs</div></div>
              <div><div className="text-xs font-medium text-muted">SO No.</div><div className="font-mono text-xs text-slate-500 break-all">{c.soNo || '—'}</div></div>
              <div><div className="text-xs font-medium text-muted">Transport</div><div className="text-slate-600 break-words">{c.transportName || '—'}</div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Challan No.', 'Date', 'Customer', 'SO No.', 'Items', 'Transport', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>)}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-4"><EmptyState message="No delivery challans found." className="border-0" /></td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sales/delivery-challans/${c.id}`)}>
                <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{c.challanNo}</td>
                <td className="px-4 py-3 text-slate-600">{c.date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{c.customer}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.soNo || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{c.lines.reduce((s, l) => s + l.qty, 0)} pcs</td>
                <td className="px-4 py-3 text-slate-600">{c.transportName || '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusClsRaw[c.rawStatus]}`}>{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
