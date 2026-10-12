import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText } from 'lucide-react';
import { formatAmountWithExpenses } from '../../lib/format/money';
import { RestrictedValue } from '../../lib/permissions/Can';
import { salesOrdersApi, soStatusLabel, apiErrorMessage, fmtDate } from '../../lib/api/sales';
import { ErrorBanner } from './shared';
import { EmptyState, STAGGER_CHILDREN, FilterPills } from '../pageKit';
import { AnimatedNumber } from '../../components/motion';

interface SalesOrder {
  id: string;
  soNo: string;
  date: string;
  customer: string;
  itemCount: number;
  totalQty: number;
  /** Taxable value (before GST). */
  total: number;
  /** Transport/handling etc. added on top of `total` — "Expenses (if any)". */
  expenses?: number;
  status: 'Draft' | 'Confirmed' | 'Partially Invoiced' | 'Invoiced' | 'Cancelled';
}


const statusCfg: Record<SalesOrder['status'], { cls: string; label: string }> = {
  Draft: { cls: 'bg-slate-100 text-slate-600', label: 'Draft' },
  Confirmed: { cls: 'bg-[#FFDCE5] text-[#B80037]', label: 'Confirmed' },
  'Partially Invoiced': { cls: 'bg-amber-100 text-amber-700', label: 'Partially Invoiced' },
  Invoiced: { cls: 'bg-green-100 text-green-700', label: 'Invoiced' },
  Cancelled: { cls: 'bg-red-100 text-red-600', label: 'Cancelled' },
};

function inr(n?: number | null) {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SalesOrderList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | SalesOrder['status']>('All');

  const [error, setError] = useState('');
  useEffect(() => {
    salesOrdersApi.list()
      .then(rows => setOrders(rows.map(o => ({
        id: o._id,
        soNo: o.docNo,
        date: fmtDate(o.docDate),
        customer: o.customerName ?? '',
        itemCount: o.itemCount,
        totalQty: o.totalQty,
        total: o.taxableTotal,
        expenses: (o.shippingCharge ?? 0) + (o.otherCharges ?? 0) || undefined,
        status: soStatusLabel[o.status] as SalesOrder['status'],
      }))))
      .catch(e => setError(apiErrorMessage(e, 'Could not load sales orders.')))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = orders.filter(o =>
    (statusFilter === 'All' || o.status === statusFilter) &&
    (o.soNo.toLowerCase().includes(search.toLowerCase()) ||
      o.customer.toLowerCase().includes(search.toLowerCase()))
  );

  const confirmedValue = orders.filter(o => o.status !== 'Draft' && o.status !== 'Cancelled').reduce((s, o) => s + o.total + (o.expenses || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Sales Orders</h1>
          <p className="text-sm text-slate-500">Confirming a sales order reserves stock (ATP) but does not reduce on-hand.</p>
        </div>
        <button
          onClick={() => navigate('/sales/orders/new')}
          className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037] transition-colors"
        >
          <Plus size={16} /> New Sales Order
        </button>
      </div>

      <ErrorBanner message={error} />

      {/* Summary */}
      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        {[
          { label: 'All Orders', value: orders.length, sub: 'total' },
          { label: 'Confirmed', value: orders.filter(o => o.status === 'Confirmed').length, sub: 'awaiting invoice' },
          { label: 'Invoiced', value: orders.filter(o => o.status === 'Invoiced').length, sub: 'complete' },
          { label: 'Total Value', value: confirmedValue, sub: 'confirmed orders, before GST', restricted: true },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200/80 shadow-card p-4 min-w-0">
            <div className="text-xs text-slate-400 mb-1">{s.label}</div>
            <div className="text-lg md:text-xl font-bold text-slate-900 break-words">
              {s.restricted ? <RestrictedValue perm="salesorders.rate.view"><AnimatedNumber value={s.value} format={inr} /></RestrictedValue> : <AnimatedNumber value={s.value} />}
            </div>
            <div className="text-xs text-slate-400">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 basis-full sm:basis-auto sm:min-w-[200px] max-w-full sm:max-w-sm">
          <input
            type="text"
            placeholder="Search by SO no. or customer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <FilterPills options={['All', 'Draft', 'Confirmed', 'Partially Invoiced', 'Invoiced', 'Cancelled'] as const} value={statusFilter} onChange={setStatusFilter} className="basis-full sm:basis-auto" />
      </div>

      {/* Table */}
      {/* Mobile cards */}
      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <EmptyState message="No sales orders found." />
        ) : filtered.map(o => (
          <div key={o.id} className="pressable cursor-pointer w-full text-left flex flex-col gap-2 p-4 bg-white border border-slate-200 rounded-xl shadow-sm active:bg-slate-50" role="button" onClick={() => navigate(`/sales/orders/${o.id}`)}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-[#B80037] text-sm">{o.soNo}</div>
                <div className="font-medium text-slate-900 text-sm break-words">{o.customer}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCfg[o.status].cls}`}>{statusCfg[o.status].label}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{o.date}</div></div>
              <div><div className="text-xs font-medium text-muted">Items / Qty</div><div className="text-slate-700">{o.itemCount} · {o.totalQty.toLocaleString('en-IN')} pcs</div></div>
              <div className="col-span-2"><div className="text-xs font-medium text-muted">Value (pre-GST)</div><div className="font-semibold text-slate-900"><RestrictedValue perm="salesorders.rate.view">{formatAmountWithExpenses(o.total, o.expenses)}</RestrictedValue></div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['SO No.', 'Date', 'Customer', 'Items', 'Qty', 'Value (pre-GST)', 'Status', ''].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-4"><EmptyState message="No sales orders found." className="border-0" /></td></tr>
            ) : filtered.map(o => {
              const cfg = statusCfg[o.status];
              return (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/sales/orders/${o.id}`)}>
                  <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{o.soNo}</td>
                  <td className="px-4 py-3 text-slate-600">{o.date}</td>
                  <td className="px-4 py-3 font-medium text-slate-900">{o.customer}</td>
                  <td className="px-4 py-3 text-slate-600">{o.itemCount}</td>
                  <td className="px-4 py-3 text-slate-700">{o.totalQty.toLocaleString('en-IN')} pcs</td>
                  <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                    <RestrictedValue perm="salesorders.rate.view">{formatAmountWithExpenses(o.total, o.expenses)}</RestrictedValue>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${cfg.cls}`}>{cfg.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/sales/orders/${o.id}`); }}
                      className="flex items-center gap-1 text-xs text-[#E40043] hover:text-[#8F002B] font-medium"
                    >
                      <FileText size={13} /> View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
