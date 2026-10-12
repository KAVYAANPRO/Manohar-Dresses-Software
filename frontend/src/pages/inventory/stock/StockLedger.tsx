import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, X } from 'lucide-react';
import { stockApi, MOVEMENT_LABEL, fmtQty, type LedgerRow } from '../../../lib/api/inventory';
import { problemMessage } from '../../../lib/api/procurement';
import { EmptyState, STAGGER_CHILDREN } from '../../pageKit';
import { PickerSheet, PickerField } from '../../../components/forms/PickerSheet';

const movementColors: Record<string, string> = {
  OPENING: 'bg-slate-100 text-slate-800',
  INWARD: 'bg-green-100 text-green-800',
  ISSUE: 'bg-orange-100 text-orange-800',
  RETURN_FROM_FACTORY: 'bg-[#FFDCE5] text-[#8F002B]',
  CONSUMPTION: 'bg-[#FFDCE5] text-[#8F002B]',
  PROCESS_OUTPUT: 'bg-cyan-100 text-cyan-800',
  PRODUCTION_RECEIPT: 'bg-teal-100 text-teal-800',
  REJECTION: 'bg-rose-100 text-rose-800',
  SHORTAGE_WRITE_OFF: 'bg-red-100 text-red-800',
  ADJUSTMENT_IN: 'bg-purple-100 text-purple-800',
  ADJUSTMENT_OUT: 'bg-purple-100 text-purple-800',
  SALE: 'bg-emerald-100 text-emerald-800',
  SALES_RETURN: 'bg-[#FFDCE5] text-[#8F002B]',
  PURCHASE_RETURN: 'bg-orange-100 text-orange-800',
  TRANSFER: 'bg-sky-100 text-sky-800',
  REVERSAL: 'bg-red-100 text-red-800',
};

const PAGE = 100;

function dt(d: string) {
  const x = new Date(d);
  return `${x.toLocaleDateString('en-GB').replace(/\//g, '-')} ${x.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function StockLedger() {
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState<LedgerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const stockItemId = params.get('stockItemId') ?? undefined;
  const lotId = params.get('lotId') ?? undefined;
  const docId = params.get('docId') ?? undefined;
  const scoped = Boolean(stockItemId || lotId || docId);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    stockApi.ledger({ stockItemId, lotId, docId, movementType: movementType || undefined, from: from || undefined, to: to || undefined, limit })
      .then(d => { if (active) { setEntries(d.rows); setTotal(d.total); setError(''); } })
      .catch(err => active && setError(problemMessage(err, 'Could not load the stock ledger.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, [stockItemId, lotId, docId, movementType, from, to, limit]);

  const q = search.toLowerCase();
  const filtered = entries.filter(e =>
    e.itemName.toLowerCase().includes(q) ||
    e.docNo.toLowerCase().includes(q) ||
    (e.lotNo ?? '').toLowerCase().includes(q)
  );
  const signed = (row: LedgerRow) => row.direction === 'OUT' ? '-' : row.direction === 'IN' ? '+' : '';
  const qtyClass = (row: LedgerRow) => row.direction === 'OUT' ? 'text-red-600' : row.direction === 'IN' ? 'text-green-700' : 'text-slate-700';

  const inputCls = 'px-3 py-2 text-base md:text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#E40043]';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Stock Ledger</h1>
        <p className="text-sm text-slate-500">Complete history of all stock movements. Posted entries cannot be edited or deleted.</p>
      </div>

      <div className="flex items-start gap-3 bg-[#FFF0F3] border border-[#FFB8CA] rounded-xl px-4 py-3">
        <Info size={16} className="text-[#E40043] shrink-0 mt-0.5" />
        <p className="text-sm text-[#8F002B]">
          This ledger is <span className="font-semibold">append-only</span>. Corrections are made through reversals and new entries — existing rows are never modified or deleted.
        </p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      {scoped && (
        <div className="flex items-center gap-2 text-sm">
          <span className="px-3 py-1.5 rounded-full bg-[#FFDCE5] text-[#8F002B]">
            Filtered to {lotId ? `lot ${entries[0]?.lotNo ?? ''}` : docId ? `document ${entries[0]?.docNo ?? ''}` : entries[0]?.itemName ?? 'one item'}
          </span>
          <button onClick={() => setParams({})} className="inline-flex items-center gap-1 min-h-9 px-2 text-slate-500 hover:text-slate-800"><X size={14} /> Clear</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search item, reference, or lot..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${inputCls} col-span-2 md:w-72`}
        />
        <PickerField
          className="col-span-2 md:w-56"
          value={movementType ? MOVEMENT_LABEL[movementType as keyof typeof MOVEMENT_LABEL] ?? movementType : 'All movement types'}
          onOpen={() => setTypePickerOpen(true)}
        />
        <input type="date" className={inputCls} value={from} onChange={e => setFrom(e.target.value)} aria-label="From date" />
        <input type="date" className={inputCls} value={to} onChange={e => setTo(e.target.value)} aria-label="To date" />
      </div>

      <PickerSheet
        open={typePickerOpen}
        title="Movement type"
        items={[{ id: '', title: 'All movement types' }, ...Object.entries(MOVEMENT_LABEL).map(([k, v]) => ({ id: k, title: String(v), keywords: k }))]}
        selectedId={movementType}
        searchPlaceholder="Search movement type…"
        onSelect={it => { setMovementType(it.id); setTypePickerOpen(false); }}
        onClose={() => setTypePickerOpen(false)}
      />

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">

        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Date', 'Type', 'Item', 'Lot', 'Qty', 'Reference', 'Source → Destination', 'User', 'Remarks'].map(h => (
                <th key={h} className="px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-3 bg-slate-200 rounded w-full" /></td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
              ? (
                <tr><td colSpan={9} className="p-4"><EmptyState message="No ledger entries found." className="border-0" /></td></tr>
              )
              : filtered.map(row => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{dt(row.postedAt)}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${movementColors[row.movementType] ?? 'bg-slate-100 text-slate-700'}`}>
                        {MOVEMENT_LABEL[row.movementType] ?? row.movementType}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-900 max-w-[200px]"><div className="truncate" title={row.itemName}>{row.itemName}</div></td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      <button className="hover:underline" onClick={() => setParams({ lotId: row.lotId })}>{row.lotNo ?? '—'}</button>
                    </td>
                    <td className={`px-3 py-3 font-semibold whitespace-nowrap ${qtyClass(row)}`}>{signed(row)}{fmtQty(row.qty)} {row.uomCode ?? ''}</td>
                    <td className="px-3 py-3 font-mono text-xs text-[#E40043] whitespace-nowrap">{row.docNo}</td>
                    <td className="px-3 py-3 text-slate-600 text-xs whitespace-nowrap">{row.fromLocation} → {row.toLocation}</td>
                    <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{row.postedBy}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs max-w-[160px]"><div className="truncate" title={row.reason}>{row.reason ?? '—'}</div></td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <div className={`md:hidden flex flex-col gap-3 ${STAGGER_CHILDREN}`}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-white animate-pulse">
                <div className="h-3 w-1/2 bg-slate-200 rounded" />
                <div className="h-3 w-3/4 bg-slate-200 rounded" />
              </div>
            ))
          : filtered.length === 0
          ? (
            <EmptyState message="No ledger entries found." />
          )
          : filtered.map(row => (
              <div key={row.id} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-white">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 break-words">{row.itemName}</div>
                    <div className="font-mono text-xs text-slate-500">{dt(row.postedAt)}</div>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${movementColors[row.movementType] ?? 'bg-slate-100 text-slate-700'}`}>
                    {MOVEMENT_LABEL[row.movementType] ?? row.movementType}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs font-medium text-muted">Qty</div>
                    <div className={`font-semibold ${qtyClass(row)}`}>{signed(row)}{fmtQty(row.qty)} {row.uomCode ?? ''}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">Lot</div>
                    <button className="font-mono text-xs text-slate-600 break-all text-left" onClick={() => setParams({ lotId: row.lotId })}>{row.lotNo ?? '—'}</button>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">Reference</div>
                    <div className="font-mono text-xs text-[#E40043] break-all">{row.docNo}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted">User</div>
                    <div className="text-slate-500">{row.postedBy}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs font-medium text-muted">Source → Destination</div>
                    <div className="text-xs text-slate-600">{row.fromLocation} → {row.toLocation}</div>
                  </div>
                  {row.reason && (
                    <div className="col-span-2">
                      <div className="text-xs font-medium text-muted">Remarks</div>
                      <div className="text-xs text-slate-500 break-words">{row.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
      </div>

      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-slate-400 text-center">Showing {filtered.length} of {total} entries.</p>
        {entries.length < total && (
          <button onClick={() => setLimit(l => l + PAGE)} className="min-h-10 px-4 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:bg-slate-50">Load more</button>
        )}
      </div>
    </div>
  );
}
