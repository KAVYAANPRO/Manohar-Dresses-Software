import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronRight, Package, Scissors, Factory, Truck, ShoppingCart } from 'lucide-react';
import { traceApi, apiErrorMessage, type TraceIcon, type TraceResult } from '../../lib/api/insights';

const iconMap: Record<TraceIcon, React.ReactNode> = {
  purchase: <ShoppingCart size={14} />,
  inward: <Package size={14} />,
  stock: <Package size={14} />,
  design: <Scissors size={14} />,
  job: <Factory size={14} />,
  receive: <Truck size={14} />,
  sale: <ShoppingCart size={14} />,
};

const iconBg: Record<TraceIcon, string> = {
  purchase: 'bg-[#FFDCE5] text-[#E40043]',
  inward: 'bg-green-100 text-green-600',
  stock: 'bg-slate-100 text-slate-600',
  design: 'bg-purple-100 text-purple-600',
  job: 'bg-amber-100 text-amber-600',
  receive: 'bg-teal-100 text-teal-600',
  sale: 'bg-rose-100 text-rose-600',
};

/** TRC-01: search by any reference and walk the lot/job-level chain from purchase to invoice. */
export function TraceabilitySearch() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('ref') ?? '');
  const [result, setResult] = useState<TraceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async (ref = query) => {
    if (!ref.trim()) return;
    setIsLoading(true);
    setError('');
    setResult(null);
    setParams({ ref: ref.trim() }, { replace: true });
    try {
      setResult(await traceApi.search(ref.trim()));
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not trace this reference.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">Traceability</h1>
        <p className="text-sm text-slate-500">Trace the lifecycle of an invoice, sales order, job slip, lot, purchase, inward or design — from supplier to customer.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-5">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Search by reference</div>
        <form className="flex flex-col sm:flex-row gap-3" onSubmit={e => { e.preventDefault(); handleSearch(); }}>
          <div className="relative flex-1 min-w-0">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Invoice / SO / job slip / lot / PO / inward number, or design no."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E40043]"
            />
          </div>
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037] disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Searching…' : 'Trace'}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-400">Exact document numbers, e.g. INV/26-27/00001, JS/26-27/00003, or a lot number from the Lots screen.</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="w-7 h-7 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 md:px-5 py-8 text-center text-slate-500 text-sm break-words">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <div className="bg-[#FFF0F3] border border-[#FFB8CA] rounded-xl px-4 py-3 text-sm text-[#5E001C] font-medium break-words">
            {result.summary}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 md:px-5 py-4 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Lifecycle — {result.nodes.length} stage{result.nodes.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {result.nodes.map((node, idx) => (
                <button
                  key={node.key}
                  type="button"
                  onClick={() => node.link && navigate(node.link)}
                  className="w-full text-left flex items-start gap-3 md:gap-4 px-4 md:px-5 py-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconBg[node.icon]}`}>
                      {iconMap[node.icon]}
                    </div>
                    {idx < result.nodes.length - 1 && <div className="w-px h-4 bg-slate-200 mt-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">{node.stage}</span>
                      <span className="font-mono text-xs text-[#B80037] bg-[#FFF0F3] px-1.5 py-0.5 rounded break-all">{node.refNo}</span>
                      {node.status && <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{node.status}</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 break-words">{node.date}{node.date && ' · '}{node.details}</div>
                  </div>
                  {node.link && <ChevronRight size={14} className="text-slate-300 shrink-0 mt-1" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
