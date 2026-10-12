import { useState } from 'react';
import { Download, BarChart2, Package, Scissors, Factory, ShoppingCart, TrendingUp, FileText, AlertTriangle, ShieldAlert, Play, X, Clock } from 'lucide-react';
import { Can } from '../../lib/permissions/Can';
import { usePermission } from '../../lib/permissions/usePermission';
import { reportsApi, apiErrorMessage, blobErrorMessage, fmtDate, type ReportRow } from '../../lib/api/insights';
import { FilterPills, EmptyState, STAGGER_CHILDREN } from '../pageKit';

type Family = 'purchase' | 'inventory' | 'manufacturing' | 'shortage' | 'costing' | 'sales' | 'compliance';

interface ReportDef {
  id: string;
  title: string;
  description: string;
  family: Family;
  path: string;
  icon: React.ReactNode;
  dateRange?: boolean;
  /** Extra backend permission(s) the endpoint needs on top of report.<family>.view. */
  extra?: string[];
}

/** prd.md §6.2 R1 reports, each backed by GET /reports/<path> (+ /csv). */
const REPORTS: ReportDef[] = [
  { id: 'purchase-history', title: 'Purchase History', description: 'Every purchase with supplier, status and total.', family: 'purchase', path: 'purchase/history', icon: <ShoppingCart size={20} />, dateRange: true },
  { id: 'purchase-by-supplier', title: 'Supplier-wise Purchases', description: 'Purchase count and value per supplier.', family: 'purchase', path: 'purchase/by-supplier', icon: <ShoppingCart size={20} />, dateRange: true },
  { id: 'raw-stock', title: 'Current Raw Stock', description: 'On-hand warehouse quantity per material item, with minimum level.', family: 'inventory', path: 'inventory/current-raw-stock', icon: <Package size={20} /> },
  { id: 'finished-stock', title: 'Finished Product Stock', description: 'Ready stock per design variant.', family: 'inventory', path: 'inventory/finished-product-stock', icon: <Package size={20} /> },
  { id: 'stock-movement', title: 'Stock Movement Ledger', description: 'Every inward and outward movement with its source document.', family: 'inventory', path: 'inventory/stock-movement', icon: <BarChart2 size={20} />, dateRange: true },
  { id: 'material-issued', title: 'Material Issued', description: 'Material issued to factories and artisans.', family: 'inventory', path: 'inventory/material-issued', icon: <FileText size={20} />, dateRange: true },
  { id: 'material-with-factory', title: 'Material with Factory', description: 'Custody balance per job worker and material.', family: 'inventory', path: 'inventory/material-with-factory', icon: <Factory size={20} /> },
  { id: 'stock-adjustments', title: 'Stock Adjustments', description: 'Proposed, approved and rejected adjustments.', family: 'inventory', path: 'inventory/stock-adjustments', icon: <AlertTriangle size={20} />, dateRange: true },
  { id: 'stock-valuation', title: 'Stock Valuation', description: 'Stock value by lot cost.', family: 'inventory', path: 'inventory/stock-valuation', icon: <TrendingUp size={20} />, extra: ['stock.value.view'] },
  { id: 'expected-vs-actual', title: 'Expected vs Actual Production', description: 'Per job: expected pieces vs accepted pieces.', family: 'manufacturing', path: 'manufacturing/expected-vs-actual', icon: <Scissors size={20} /> },
  { id: 'pending-jobs', title: 'Pending Jobs', description: 'Open job slips with factory, design and due date.', family: 'manufacturing', path: 'manufacturing/pending-jobs', icon: <Clock size={20} /> },
  { id: 'completed-jobs', title: 'Completed Jobs', description: 'Closed job slips.', family: 'manufacturing', path: 'manufacturing/completed-jobs', icon: <Factory size={20} />, dateRange: true },
  { id: 'sent-vs-received', title: 'Material Sent vs Received', description: 'Issued, consumed, returned and written off per job line.', family: 'shortage', path: 'shortage/sent-vs-received', icon: <FileText size={20} /> },
  { id: 'shortage-percent', title: 'Shortage Quantity & %', description: 'Job lines with unaccounted material.', family: 'shortage', path: 'shortage/percent', icon: <AlertTriangle size={20} /> },
  { id: 'design-cost', title: 'Design-wise Cost & Margin', description: 'Cost per piece, selling price and margin per job.', family: 'costing', path: 'costing/design-wise', icon: <TrendingUp size={20} />, extra: ['costing.view'] },
  { id: 'sales-by-customer', title: 'Customer-wise Sales', description: 'Invoice count and revenue per customer.', family: 'sales', path: 'sales/by-customer', icon: <ShoppingCart size={20} />, dateRange: true },
  { id: 'revenue', title: 'Revenue', description: 'Confirmed invoices with taxable value and total.', family: 'sales', path: 'sales/revenue', icon: <BarChart2 size={20} />, dateRange: true },
  { id: 'payment-status', title: 'Payment Status', description: 'Confirmed invoices and whether they are paid.', family: 'sales', path: 'sales/payment-status', icon: <FileText size={20} /> },
  { id: 'job-work-ageing', title: 'Job-work Ageing', description: 'Material still at each party, by days since issue (ITC-04 support).', family: 'compliance', path: 'compliance/job-work-ageing', icon: <Clock size={20} /> },
];

const FAMILY_LABEL: Record<Family, string> = {
  purchase: 'Procurement', inventory: 'Inventory', manufacturing: 'Production', shortage: 'Shortage', costing: 'Costing', sales: 'Sales', compliance: 'Compliance',
};
const FAMILY_CLS: Record<Family, string> = {
  purchase: 'bg-[#FFDCE5] text-[#B80037]',
  inventory: 'bg-green-100 text-green-700',
  manufacturing: 'bg-amber-100 text-amber-700',
  shortage: 'bg-orange-100 text-orange-700',
  costing: 'bg-purple-100 text-purple-700',
  sales: 'bg-rose-100 text-rose-700',
  compliance: 'bg-slate-100 text-slate-700',
};

export function ReportsList() {
  return (
    <Can
      perm="reports.view"
      fallback={
        <div className="bg-white border border-slate-200 rounded-xl p-10 flex flex-col items-center text-center gap-2">
          <ShieldAlert size={28} className="text-slate-300" />
          <h2 className="text-lg font-semibold text-slate-700">Reports are restricted</h2>
          <p className="text-sm text-slate-500 max-w-sm">Your account has no report permissions. Contact your administrator if you need access.</p>
        </div>
      }
    >
      <ReportsListContent />
    </Can>
  );
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
function humanize(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).replace(/ Id$/, ' ID');
}
function cell(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (typeof v === 'string' && ISO_DATE.test(v)) return fmtDate(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
/** Hide raw ids whenever the backend supplied a readable label for them. */
function visibleColumns(rows: ReportRow[]): string[] {
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  return keys.filter(k => !(k.endsWith('Id') && keys.includes(k.replace(/Id$/, 'Name'))) && k !== '_id');
}

function today() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

function ReportViewer({ report, canExport, onClose }: { report: ReportDef; canExport: boolean; onClose: () => void }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState('');
  const params = report.dateRange ? { from, to } : undefined;

  const run = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await reportsApi.run(report.path, params);
      setRows(Array.isArray(data) ? data : [data as ReportRow]);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not run this report.'));
    } finally {
      setIsLoading(false);
    }
  };

  const exportCsv = async () => {
    setIsExporting(true);
    setError('');
    try {
      await reportsApi.downloadCsv(report.path, `${report.id}.csv`, params);
    } catch (err) {
      setError(await blobErrorMessage(err, 'Could not export this report.'));
    } finally {
      setIsExporting(false);
    }
  };

  const cols = rows ? visibleColumns(rows) : [];

  return (
    <div className="bg-white rounded-xl border border-[#FFB8CA] shadow-sm p-3 md:p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-slate-900">{report.title}</h2>
          <p className="text-xs text-slate-500">{report.description}</p>
        </div>
        <button onClick={onClose} className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close report"><X size={16} /></button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:flex-wrap">
        {report.dateRange && (
          <>
            <label className="text-xs text-slate-600 flex flex-col gap-1">From
              <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </label>
            <label className="text-xs text-slate-600 flex flex-col gap-1">To
              <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            </label>
          </>
        )}
        <button onClick={run} disabled={isLoading} className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg disabled:opacity-60">
          <Play size={14} /> {isLoading ? 'Running…' : rows ? 'Refresh' : 'Run report'}
        </button>
        {canExport && (
          <button onClick={exportCsv} disabled={isExporting} className="flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 border border-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-60">
            <Download size={14} /> {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>
      {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{error}</div>}
      {rows && (
        rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No rows for this report{report.dateRange ? ' in the selected range' : ''}.</p>
        ) : (
          <>
            <p className="text-xs text-slate-500">{rows.length} row{rows.length === 1 ? '' : 's'}</p>
            <div className="md:hidden flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
              {rows.slice(0, 200).map((r, i) => (
                <div key={i} className="p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] grid grid-cols-2 gap-2 text-sm">
                  {cols.map(c => (
                    <div key={c} className="min-w-0"><p className="text-xs text-muted">{humanize(c)}</p><p className="break-words">{cell(r[c])}</p></div>
                  ))}
                </div>
              ))}
              {rows.length > 200 && <p className="text-xs text-slate-400 text-center">Showing first 200 rows — export CSV for all.</p>}
            </div>
            <div className="hidden md:block overflow-x-auto max-h-[60vh] border border-slate-100 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>{cols.map(c => <th key={c} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{humanize(c)}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 1000).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {cols.map(c => <td key={c} className={`px-3 py-2 whitespace-nowrap ${typeof r[c] === 'number' ? 'text-right' : ''}`}>{cell(r[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  );
}

function ReportsListContent() {
  const { hasCode } = usePermission();
  const [activeFamily, setActiveFamily] = useState<'all' | Family>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const allowed = REPORTS.filter(r => hasCode(`report.${r.family}.view`) && (r.extra ?? []).every(hasCode));
  const families = Array.from(new Set(allowed.map(r => r.family)));
  const filtered = allowed.filter(r => activeFamily === 'all' || r.family === activeFamily);
  const canExport = hasCode('report.export');
  const open = allowed.find(r => r.id === openId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">Live operational reports{canExport ? ' with CSV export' : ''}. Charts and KPIs are on the dashboard.</p>
      </div>

      <FilterPills options={['all', ...families] as const} value={activeFamily} onChange={setActiveFamily} label={f => (f === 'all' ? 'All' : FAMILY_LABEL[f])} />

      {open && <ReportViewer key={open.id} report={open} canExport={canExport} onClose={() => setOpenId(null)} />}

      {filtered.length === 0 && <EmptyState message="No reports available for your account." />}

      {families.filter(f => activeFamily === 'all' || f === activeFamily).map(f => (
        <div key={f}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${FAMILY_CLS[f]}`}>{FAMILY_LABEL[f]}</span>
          </div>
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${STAGGER_CHILDREN}`}>
            {filtered.filter(r => r.family === f).map(r => (
              <button key={r.id} type="button" onClick={() => { setOpenId(r.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`pressable lift text-left bg-white rounded-xl border shadow-card p-4 flex items-start gap-3 md:gap-4 hover:border-[#FFB8CA] transition-colors ${openId === r.id ? 'border-[#E40043]' : 'border-slate-200'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${FAMILY_CLS[r.family]}`}>{r.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 text-sm">{r.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{r.description}</div>
                </div>
                <span className="shrink-0 text-xs text-[#E40043] font-medium self-center">Open</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
