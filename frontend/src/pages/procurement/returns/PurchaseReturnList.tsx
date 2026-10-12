import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw } from 'lucide-react';
import { Can, RestrictedValue } from '../../../lib/permissions/Can';
import { suppliersApi } from '../../../lib/api/suppliers';
import { purchaseReturnsApi, inwardsApi, problemMessage, formatDate, type PurchaseReturn } from '../../../lib/api/procurement';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';

function inr(n: number) { return '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
const statusCls: Record<PurchaseReturn['status'], string> = {
  DRAFT: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};
const statusLabel: Record<PurchaseReturn['status'], string> = { DRAFT: 'Draft', CONFIRMED: 'Debited', CANCELLED: 'Cancelled' };

interface Row extends PurchaseReturn { supplierName: string; inwardNo: string }

export function PurchaseReturnList() {
  const navigate = useNavigate();
  const [returns, setReturns] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([purchaseReturnsApi.list(), suppliersApi.list(), inwardsApi.list()])
      .then(([rs, sups, inws]) => {
        if (!active) return;
        const sup = new Map(sups.map(s => [s._id, s.name]));
        const inw = new Map(inws.map(i => [i._id, i.docNo]));
        setReturns(rs.map(r => ({ ...r, supplierName: sup.get(r.supplierId) ?? '—', inwardNo: inw.get(r.inwardId) ?? '—' })));
      })
      .catch(err => active && setError(problemMessage(err, 'Could not load purchase returns.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const q = search.toLowerCase();
  const filtered = returns.filter(r =>
    r.docNo.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q) ||
    r.inwardNo.toLowerCase().includes(q) || (r.debitNoteNo ?? '').toLowerCase().includes(q)
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2"><RotateCcw size={22} /> Purchase Returns</h1>
          <p className="text-muted">Materials sent back to a supplier from a received lot, with a debit note.</p>
        </div>
        <Can perm="purchases.create">
          <button onClick={() => navigate('/procurement/returns/new')} className="w-full sm:w-auto min-h-10 flex items-center justify-center gap-2 px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]">
            <Plus size={16} /> New Return
          </button>
        </Can>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <input type="text" placeholder="Search by return no., supplier, inward or debit note..." value={search} onChange={e => setSearch(e.target.value)}
        className="w-full max-w-sm px-3 py-2 text-base md:text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]" />

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Return No.', 'Date', 'Supplier', 'Inward No.', 'Reason', 'Debit Note', 'Amount', 'Status'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>)}</tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-4"><EmptyState message="No purchase returns found." className="border-0" /></td></tr>
            ) : filtered.map(r => (
              <tr key={r._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer" onClick={() => navigate(`/procurement/returns/${r._id}`)}>
                <td className="px-4 py-3 font-mono font-semibold text-[#B80037]">{r.docNo}</td>
                <td className="px-4 py-3 text-slate-600">{formatDate(r.docDate)}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{r.supplierName}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.inwardNo}</td>
                <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{r.reason}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.debitNoteNo || '—'}</td>
                <td className="px-4 py-3 font-semibold text-slate-900"><RestrictedValue perm="purchases.rate.view">{inr(r.totalAmount)}</RestrictedValue></td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[r.status]}`}>{statusLabel[r.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-white animate-pulse">
              <div className="h-3 w-1/2 bg-slate-200 rounded" />
              <div className="h-3 w-3/4 bg-slate-200 rounded" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <EmptyState message="No purchase returns found." />
        ) : filtered.map(r => (
          <button
            key={r._id}
            type="button"
            onClick={() => navigate(`/procurement/returns/${r._id}`)}
            className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-white text-left hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-2 w-full">
              <div className="min-w-0">
                <div className="font-mono font-semibold text-[#B80037]">{r.docNo}</div>
                <div className="font-medium text-slate-900 break-words">{r.supplierName}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls[r.status]}`}>{statusLabel[r.status]}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 w-full text-sm">
              <div><div className="text-xs font-medium text-muted">Date</div><div className="text-slate-600">{formatDate(r.docDate)}</div></div>
              <div><div className="text-xs font-medium text-muted">Amount</div><div className="font-semibold text-slate-900"><RestrictedValue perm="purchases.rate.view">{inr(r.totalAmount)}</RestrictedValue></div></div>
              <div><div className="text-xs font-medium text-muted">Inward No.</div><div className="font-mono text-xs text-slate-500">{r.inwardNo}</div></div>
              <div><div className="text-xs font-medium text-muted">Debit Note</div><div className="font-mono text-xs text-slate-500">{r.debitNoteNo || '—'}</div></div>
              <div className="col-span-2"><div className="text-xs font-medium text-muted">Reason</div><div className="text-slate-600 break-words">{r.reason}</div></div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
