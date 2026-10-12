import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { Can } from '../../lib/permissions/Can';
import { usePermission } from '../../lib/permissions/usePermission';
import { formatINR } from '../../lib/format/money';
import { costingApi, type CostSheetDetail as Sheet } from '../../lib/api/jobwork';
import { toProblem, fmtDate, fmtQty } from '../../lib/api/production';
import { STAGGER_CHILDREN } from '../pageKit';
import { AnimatedNumber } from '../../components/motion';

function inr(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const KIND_LABEL = { MANUFACTURING: 'Manufacturing / job work', PROCESSING: 'Processing / dyeing', OTHER: 'Expenses' } as const;

export function CostSheetDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { has } = usePermission();
  const allowed = has('costing.view');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !allowed) { setIsLoading(false); return; }
    costingApi.get(id).then(setSheet).catch(e => setError(toProblem(e).detail)).finally(() => setIsLoading(false));
  }, [id, allowed]);

  if (isLoading) return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
  if (!allowed) return <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500 max-w-3xl">You don't have permission to view costing data.</div>;
  if (!sheet) return <div className="p-6 text-red-600 text-sm">{error || 'Cost sheet not found.'}</div>;

  const c = sheet.components;
  const isGarment = sheet.jobType === 'MANUFACTURING';
  const unit = isGarment ? 'Garment' : 'Unit';
  const positiveMargin = sheet.margin >= 0;
  const chargesOf = (k: keyof typeof KIND_LABEL) => sheet.charges.filter(x => x.kind === k);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-start gap-2 md:gap-3">
        <button onClick={() => navigate('/costing')} className="shrink-0 flex items-center justify-center w-10 h-10 -ml-2 md:ml-0 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Back"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold break-words text-slate-900">Cost Sheet — {sheet.jobSlip}</h1>
            <Lock size={15} className="text-slate-400" />
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${sheet.type === 'Final' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{sheet.type}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5 break-words">{sheet.design} · {sheet.factory} · {fmtDate(sheet.date)}</p>
        </div>
      </div>

      <Can perm="costing.view">
        <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <div className="text-xs text-slate-400 mb-1">Accepted</div>
            <div className="text-xl md:text-2xl font-bold text-slate-900">{fmtQty(sheet.acceptedQty)}</div>
            <div className="text-xs text-slate-400">{isGarment ? 'pcs' : 'received'}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
            <div className="text-xs text-slate-400 mb-1">Total Cost</div>
            <div className="text-base md:text-xl font-bold text-slate-900 break-words"><AnimatedNumber value={sheet.totalCost} format={inr} /></div>
          </div>
          <div className="bg-[#FFF0F3] rounded-xl border border-[#FFB8CA] shadow-sm p-4 text-center">
            <div className="text-xs text-[#E40043] mb-1">Cost / {unit}</div>
            <div className="text-base md:text-xl font-bold text-[#B80037] break-words"><AnimatedNumber value={sheet.costPerGarment} format={inr} /></div>
          </div>
          {isGarment && sheet.sellingRate > 0 ? (
            <div className={`rounded-xl border shadow-sm p-4 text-center ${positiveMargin ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className={`text-xs mb-1 ${positiveMargin ? 'text-green-500' : 'text-red-500'}`}>Margin / Garment</div>
              <div className={`text-base md:text-xl font-bold flex flex-wrap items-center justify-center gap-1 ${positiveMargin ? 'text-green-700' : 'text-red-600'}`}>
                {positiveMargin ? <TrendingUp size={18} /> : <TrendingDown size={18} />}{inr(Math.abs(sheet.margin))}
              </div>
              <div className={`text-xs font-medium ${positiveMargin ? 'text-green-600' : 'text-red-500'}`}>{sheet.marginPct.toFixed(1)}%</div>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Selling Rate</div>
              <div className="text-sm text-slate-400">{isGarment ? 'Not set on design' : 'n/a (material)'}</div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 md:px-5 py-4 border-b border-slate-100 bg-slate-50">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cost Breakdown</div>
          </div>

          <div className="px-4 md:px-5 py-3 border-b border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Material Cost (issued − returned, at lot cost)</div>
            <div className="flex flex-col gap-1">
              {sheet.materialLines.length === 0 && <div className="text-sm text-slate-400">No material issued.</div>}
              {sheet.materialLines.map((line, i) => (
                <div key={i} className="flex items-start justify-between gap-3 text-sm py-1">
                  <div className="min-w-0">
                    <span className="text-slate-800">{line.bomRole ? `${line.bomRole}: ` : ''}{line.label}</span>
                    <span className="text-xs text-slate-400 ml-2">{line.detail}</span>
                    {line.processingIncluded > 0 && (
                      <div className="text-xs text-[#B80037]">incl. {formatINR(line.processingIncluded)} processing from {line.sourceProcessingJobs.join(', ')}</div>
                    )}
                  </div>
                  <span className="font-medium text-slate-900 shrink-0 whitespace-nowrap">{inr(line.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold pt-2 border-t border-slate-100 mt-1">
                <span className="text-slate-600">Material Subtotal</span>
                <span className="text-slate-900">{inr(c.material)}</span>
              </div>
            </div>
          </div>

          {(['PROCESSING', 'MANUFACTURING', 'OTHER'] as const).map(k => {
            const rows = chargesOf(k);
            const total = k === 'PROCESSING' ? c.processing : k === 'MANUFACTURING' ? c.manufacturing : c.other;
            if (rows.length === 0 && total === 0 && !(k === 'PROCESSING' && c.materialProcessingIncluded > 0)) return null;
            return (
              <div key={k} className="px-4 md:px-5 py-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{KIND_LABEL[k]}</div>
                  <span className="font-medium text-slate-900 shrink-0 whitespace-nowrap">{inr(total)}</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className="text-xs text-slate-500 mt-1">
                    {r.receiptNo ? `${r.receiptNo}: ` : ''}{r.basis === 'LUMP_SUM' ? 'lump sum' : `${fmtQty(r.quantity)} × ${formatINR(r.rate)}`} = {formatINR(r.amount)}{r.note ? ` (${r.note})` : ''}
                  </div>
                ))}
                {k === 'PROCESSING' && c.materialProcessingIncluded > 0 && (
                  <div className="text-xs text-[#B80037] mt-1">Dyeing/processing already inside the fabric cost above: {formatINR(c.materialProcessingIncluded)}</div>
                )}
              </div>
            );
          })}

          <div className="px-4 md:px-5 py-4 bg-slate-50">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-bold text-slate-900">Total Production Cost</span>
              <span className="text-lg md:text-xl font-bold text-slate-900 break-words">
                {c.other > 0 ? `${formatINR(sheet.totalCost - c.other)} + ${formatINR(c.other)}` : inr(sheet.totalCost)}
              </span>
            </div>
          </div>

          <div className="px-4 md:px-5 py-4 bg-[#FFF0F3] border-t border-[#FFDCE5]">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[#B80037]">Total Cost ÷ Accepted Qty ({fmtQty(sheet.acceptedQty)})</span>
                <span className="font-bold text-[#8F002B] shrink-0 whitespace-nowrap">{sheet.acceptedQty > 0 ? inr(sheet.costPerGarment) : '—'}</span>
              </div>
              {isGarment && sheet.sellingRate > 0 && (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-600">Selling Rate</span>
                    <span className="font-medium text-slate-900 shrink-0 whitespace-nowrap">{inr(sheet.sellingRate)}</span>
                  </div>
                  <div className={`flex flex-wrap justify-between gap-x-3 gap-y-1 border-t pt-2 ${positiveMargin ? 'border-green-200' : 'border-red-200'}`}>
                    <span className={`font-semibold ${positiveMargin ? 'text-green-700' : 'text-red-600'}`}>{positiveMargin ? 'Margin' : 'Loss'} per Garment</span>
                    <span className={`font-bold text-lg ${positiveMargin ? 'text-green-700' : 'text-red-600'}`}>{positiveMargin ? '' : '-'}{inr(Math.abs(sheet.margin))} ({sheet.marginPct.toFixed(1)}%)</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {sheet.type === 'Final' && (sheet.revaluations.length > 0 || sheet.varianceOnSold !== 0) && (
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 flex flex-col gap-1">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">On close</div>
            {sheet.revaluations.map((r, i) => <div key={i}>Lot cost trued up {inr(r.oldCost)} → {inr(r.newCost)}</div>)}
            {sheet.varianceOnSold !== 0 && <div>Variance on pieces already sold (not restated on invoices): {inr(sheet.varianceOnSold)}</div>}
          </div>
        )}

        {sheet.type === 'Provisional' && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>This is a <span className="font-semibold">provisional</span> cost sheet. It becomes final when the job is <Link to={`/production/reconciliation/${sheet.jobSlipId}`} className="underline">reconciled and closed</Link>.</span>
          </div>
        )}
      </Can>
    </div>
  );
}
