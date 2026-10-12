import { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { auditApi, apiErrorMessage, blobErrorMessage, fmtDateTime, type AuditEntry } from '../../lib/api/insights';
import { usePermission } from '../../lib/permissions/usePermission';
import { EmptyState, STAGGER_CHILDREN, FilterPills } from '../pageKit';

const actionCls: Record<string, string> = {
  Created: 'bg-[#FFDCE5] text-[#B80037]',
  Confirmed: 'bg-green-100 text-green-700',
  Approved: 'bg-green-100 text-green-700',
  Posted: 'bg-purple-100 text-purple-700',
  Closed: 'bg-purple-100 text-purple-700',
  Cancelled: 'bg-red-100 text-red-700',
  Rejected: 'bg-red-100 text-red-700',
  Deactivated: 'bg-orange-100 text-orange-700',
  Edited: 'bg-slate-100 text-slate-600',
};

const PAGE_SIZE = 50;

function ChangeList({ e }: { e: AuditEntry }) {
  if (e.action === 'INSERT') return <span className="text-slate-500">New {e.entityType}</span>;
  if (e.changes.length === 0) return <span className="text-slate-400">No business field changed</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {e.changes.slice(0, 4).map(c => (
        <span key={c.field} className="break-words">
          <span className="text-slate-500">{c.field}: </span>
          {c.before && <span className="text-slate-400 line-through mr-1">{c.before}</span>}
          <span>{c.after || '—'}</span>
        </span>
      ))}
      {e.changes.length > 4 && <span className="text-xs text-slate-400">+{e.changes.length - 4} more field(s)</span>}
    </span>
  );
}

export function AuditLog() {
  const { hasCode } = usePermission();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debounced, moduleFilter, from, to]);

  const query = {
    q: debounced || undefined,
    module: moduleFilter || undefined,
    from: from || undefined,
    to: to ? `${to}T23:59:59` : undefined,
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    auditApi.list({ ...query, page, pageSize: PAGE_SIZE })
      .then(res => {
        if (!active) return;
        setEntries(res.items);
        setTotal(res.total);
        setModules(res.modules);
      })
      .catch(err => { if (active) setError(apiErrorMessage(err, 'Could not load the audit log.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, moduleFilter, from, to, page]);

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      await auditApi.exportCsv(query);
    } catch (err) {
      setError(await blobErrorMessage(err, 'Could not export the audit log.'));
    } finally {
      setIsExporting(false);
    }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Audit Log</h1>
          <p className="text-sm text-slate-500">Append-only record of every business-table change. Nobody can edit or delete an entry through the application (AUD-01/AUD-02).</p>
        </div>
        {hasCode('audit.export') && (
          <button onClick={exportCsv} disabled={isExporting}
            className="flex items-center justify-center gap-2 w-full sm:w-auto px-4 py-2.5 md:py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-60">
            <Download size={15} /> {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-sm">
          <input
            type="text"
            placeholder="Search by reference, user, record type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg bg-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#E40043]"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} aria-label="From date"
            className="flex-1 sm:flex-none px-3 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg bg-white" />
          <input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} aria-label="To date"
            className="flex-1 sm:flex-none px-3 py-2.5 md:py-2 text-sm border border-slate-200 rounded-lg bg-white" />
        </div>
        <FilterPills options={['', ...modules]} value={moduleFilter} onChange={setModuleFilter} label={m => <span className="capitalize">{m || 'All'}</span>} className="w-full min-w-0 sm:w-auto" />
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className={`md:hidden flex flex-col gap-2 ${STAGGER_CHILDREN}`}>
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-lg bg-slate-200 animate-pulse" />)
        ) : entries.length === 0 ? (
          <EmptyState message="No audit entries found." />
        ) : entries.map(e => (
          <div key={e._id} className="flex flex-col gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono text-xs text-[#B80037] break-all">{e.ref}</span>
              <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-semibold ${actionCls[e.actionLabel] || 'bg-slate-100 text-slate-600'}`}>{e.actionLabel}</span>
            </div>
            <div className="text-sm text-slate-700"><ChangeList e={e} /></div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-xs text-muted">User</p><p className="font-medium text-slate-700 break-words">{e.actorName}</p></div>
              <div><p className="text-xs text-muted">Record</p><p className="text-slate-600 break-words">{e.module} · {e.entityType}</p></div>
            </div>
            <p className="font-mono text-xs text-slate-500">{fmtDateTime(e.occurredAt)}</p>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
        <table className="w-full text-sm text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {['Timestamp', 'User', 'Action', 'Module', 'Record', 'Reference', 'Change'].map(h => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 animate-pulse">
                  {Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-3 bg-slate-200 rounded" /></td>)}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr><td colSpan={7} className="p-4"><EmptyState message="No audit entries found." className="border-0" /></td></tr>
            ) : entries.map(e => (
              <tr key={e._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 align-top">
                <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(e.occurredAt)}</td>
                <td className="px-4 py-3 font-medium text-slate-700">{e.actorName}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${actionCls[e.actionLabel] || 'bg-slate-100 text-slate-600'}`}>{e.actionLabel}</span>
                </td>
                <td className="px-4 py-3 text-slate-600 capitalize">{e.module}</td>
                <td className="px-4 py-3 text-slate-600">{e.entityType}</td>
                <td className="px-4 py-3 font-mono text-xs text-[#B80037]">{e.ref}</td>
                <td className="px-4 py-3 text-slate-700 max-w-sm text-xs"><ChangeList e={e} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-500">{total.toLocaleString('en-IN')} entries · page {page} of {pages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-40">Previous</button>
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-2 border border-slate-200 rounded-lg disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
