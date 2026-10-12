import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle, Ban } from 'lucide-react';
import { Can, RestrictedValue } from '../../lib/permissions/Can';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { salesOrdersApi, soStatusLabel, apiErrorMessage, fmtDate, inr, variantText, type SalesOrderView, type SOStatus } from '../../lib/api/sales';
import { ErrorBanner, Spinner, usePricePreview, useSellableItems } from './shared';
import { STAGGER_CHILDREN } from '../pageKit';
import { AnimatedNumber } from '../../components/motion';

const statusCfg: Record<SOStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  CONFIRMED: 'bg-[#FFDCE5] text-[#B80037]',
  PARTIALLY_INVOICED: 'bg-amber-100 text-amber-700',
  INVOICED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-600',
};

export function SalesOrderDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<SalesOrderView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const { items } = useSellableItems();

  const load = () => {
    if (!id) return;
    salesOrdersApi.get(id)
      .then(setOrder)
      .catch(e => setError(apiErrorMessage(e, 'Could not load this sales order.')))
      .finally(() => setIsLoading(false));
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineInputs = useMemo(() => (order?.lines ?? []).map(l => ({
    designVariantId: l.designVariantId, qty: l.qty, unitRate: l.unitRate, discountPct: l.discountPct, extraDiscountPct: l.extraDiscountPct || undefined,
  })), [order]);
  const extra = (order?.shippingCharge ?? 0) + (order?.otherCharges ?? 0);
  const { preview, lineAt } = usePricePreview(order?.customerId ?? '', lineInputs, extra);

  const labelFor = (variantId: string) => {
    const it = items.find(i => i.designVariantId === variantId);
    return it ? { title: `${it.designName}`, sub: variantText(it) } : { title: variantId, sub: '' };
  };

  const confirm = async () => {
    if (!order) return;
    setBusy(true); setError('');
    try { await salesOrdersApi.confirm(order._id); load(); } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!order || !cancelReason.trim()) return;
    setBusy(true); setError('');
    try { await salesOrdersApi.cancel(order._id, cancelReason.trim()); setCancelOpen(false); load(); } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  if (isLoading) return <Spinner />;
  if (!order) return <div className="p-6"><ErrorBanner message={error || 'Sales order not found.'} /></div>;

  const invoicedValue = order.invoices.filter(i => i.status === 'CONFIRMED').reduce((s, i) => s + i.grandTotal, 0);
  const canCancel = ['DRAFT', 'CONFIRMED'].includes(order.status) && order.lines.every(l => l.qtyInvoiced === 0);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/sales/orders')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 break-all">{order.docNo}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCfg[order.status]}`}>{soStatusLabel[order.status]}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {order.customer?.name} · {fmtDate(order.docDate)}
            {order.agent && <> · Agent {order.agent.name}</>}
            {order.customerRefNo && <> · Ref {order.customerRefNo}</>}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {(order.status === 'CONFIRMED' || order.status === 'PARTIALLY_INVOICED') && (
            <Can perm="invoices.edit">
              <button onClick={() => navigate(`/sales/invoices/new?soId=${order._id}`)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037]">
                <FileText size={15} /> {order.status === 'CONFIRMED' ? 'Create Invoice' : 'Invoice Remaining'}
              </button>
            </Can>
          )}
          {order.status === 'DRAFT' && (
            <Can perm="salesorders.confirm">
              <button onClick={confirm} disabled={busy}
                className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg hover:bg-[#B80037] disabled:opacity-60">
                <CheckCircle size={15} /> {busy ? 'Checking ATP…' : 'Confirm Order'}
              </button>
            </Can>
          )}
          {canCancel && (
            <Can perm="salesorders.cancel">
              <button onClick={() => setCancelOpen(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50">
                <Ban size={15} /> Cancel Order
              </button>
            </Can>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />
      {order.status === 'CANCELLED' && order.cancelReason && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">Cancelled: {order.cancelReason}</div>
      )}

      <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 ${STAGGER_CHILDREN}`}>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center"><div className="text-xs text-slate-400 mb-1">Lines</div><div className="text-2xl font-bold text-slate-900"><AnimatedNumber value={order.lines.length} /></div></div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center"><div className="text-xs text-slate-400 mb-1">Total Qty</div><div className="text-2xl font-bold text-slate-900"><AnimatedNumber value={order.lines.reduce((s, l) => s + l.qty, 0)} /> pcs</div></div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center">
          <div className="text-xs text-slate-400 mb-1">Order Value (est.)</div>
          <div className="text-lg md:text-xl font-bold text-slate-900 break-words"><RestrictedValue perm="salesorders.rate.view"><AnimatedNumber value={preview?.grandTotal ?? 0} format={inr} /></RestrictedValue></div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-center"><div className="text-xs text-slate-400 mb-1">Invoiced</div><div className="text-lg md:text-xl font-bold text-green-700 break-words"><RestrictedValue perm="invoices.rate.view"><AnimatedNumber value={invoicedValue} format={inr} /></RestrictedValue></div></div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50"><span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Order Lines</span></div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {['Design', 'Ordered', 'Invoiced', 'Pending', 'ATP', 'Rate', 'Disc', 'GST', 'Amount'].map(h => <th key={h} className="px-3 py-2 text-left text-xs text-slate-500 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l, idx) => {
                const lab = labelFor(l.designVariantId);
                const priced = lineAt(idx);
                return (
                  <tr key={l._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-3"><div className="font-medium text-slate-900">{lab.title}</div><div className="text-xs text-slate-400 font-mono">{lab.sub}</div></td>
                    <td className="px-3 py-3 font-medium text-slate-900">{l.qty}</td>
                    <td className="px-3 py-3 font-medium text-green-700">{l.qtyInvoiced}</td>
                    <td className="px-3 py-3"><span className={`font-medium ${l.pendingQty > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{l.pendingQty}</span></td>
                    <td className="px-3 py-3 text-slate-600">{l.atp}</td>
                    <td className="px-3 py-3 text-slate-700"><RestrictedValue perm="salesorders.rate.view">{inr(l.unitRate)}</RestrictedValue></td>
                    <td className="px-3 py-3 text-slate-600">{l.discountPct}%{l.extraDiscountPct ? ` + ${l.extraDiscountPct}%` : ''}</td>
                    <td className="px-3 py-3 text-slate-600">{priced ? `${priced.taxRatePct}%` : '—'}</td>
                    <td className="px-3 py-3 font-semibold text-slate-900"><RestrictedValue perm="salesorders.rate.view">{priced ? inr(priced.lineTotal) : '—'}</RestrictedValue></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={`md:hidden flex flex-col gap-3 p-3 ${STAGGER_CHILDREN}`}>
          {order.lines.map((l, idx) => {
            const lab = labelFor(l.designVariantId);
            const priced = lineAt(idx);
            return (
              <div key={l._id} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><div className="font-medium text-sm text-slate-900 break-words">{lab.title}</div><div className="text-xs text-slate-400 font-mono">{lab.sub}</div></div>
                  <div className="text-right shrink-0"><div className="text-xs font-medium text-muted">Amount</div><div className="text-sm font-semibold text-slate-900"><RestrictedValue perm="salesorders.rate.view">{priced ? inr(priced.lineTotal) : '—'}</RestrictedValue></div></div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs font-medium text-muted">Ordered</div><div className="font-medium text-slate-900">{l.qty}</div></div>
                  <div><div className="text-xs font-medium text-muted">Invoiced</div><div className="font-medium text-green-700">{l.qtyInvoiced}</div></div>
                  <div><div className="text-xs font-medium text-muted">Pending</div><div className={`font-medium ${l.pendingQty > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{l.pendingQty}</div></div>
                  <div><div className="text-xs font-medium text-muted">Rate</div><div className="text-slate-700"><RestrictedValue perm="salesorders.rate.view">{inr(l.unitRate)}</RestrictedValue></div></div>
                  <div><div className="text-xs font-medium text-muted">Disc</div><div className="text-slate-600">{l.discountPct}%</div></div>
                  <div><div className="text-xs font-medium text-muted">GST</div><div className="text-slate-600">{priced ? `${priced.taxRatePct}%` : '—'}</div></div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-end p-4 border-t border-slate-200 bg-slate-50">
          <div className="w-full max-w-xs flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Taxable</span><span className="font-semibold"><RestrictedValue perm="salesorders.rate.view">{inr(preview?.taxableTotal)}</RestrictedValue></span></div>
            {preview && (preview.isIntraState
              ? <><div className="flex justify-between"><span className="text-slate-500">CGST</span><span>{inr(preview.cgstTotal)}</span></div><div className="flex justify-between"><span className="text-slate-500">SGST</span><span>{inr(preview.sgstTotal)}</span></div></>
              : <div className="flex justify-between"><span className="text-slate-500">IGST</span><span>{inr(preview.igstTotal)}</span></div>)}
            {extra > 0 && <div className="flex justify-between"><span className="text-slate-500">Shipping + Expenses</span><span>{inr(extra)}</span></div>}
            {preview && preview.roundOff !== 0 && <div className="flex justify-between"><span className="text-slate-500">Round Off</span><span>{inr(preview.roundOff)}</span></div>}
            <div className="flex justify-between pt-2 border-t border-slate-200"><span className="font-bold">Grand Total (est.)</span><span className="font-bold text-lg"><RestrictedValue perm="salesorders.rate.view"><AnimatedNumber value={preview?.grandTotal ?? 0} format={inr} /></RestrictedValue></span></div>
          </div>
        </div>
      </div>

      {order.invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50"><span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Invoices ({order.invoices.length})</span></div>
          <div className="divide-y divide-slate-100">
            {order.invoices.map(inv => (
              <div key={inv._id} className="px-4 md:px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-mono font-semibold text-[#B80037] text-sm break-all">{inv.status === 'DRAFT' ? 'Draft invoice' : inv.docNo}</span>
                  <span className="block sm:inline text-xs text-slate-400 sm:ml-3">{fmtDate(inv.docDate)}</span>
                </div>
                <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                  <span className="font-semibold text-slate-900"><RestrictedValue perm="invoices.rate.view">{inr(inv.grandTotal)}</RestrictedValue></span>
                  <Link to={`/sales/invoices/${inv._id}`} className="flex items-center gap-1 min-h-[40px] px-1 text-xs text-[#E40043] hover:text-[#8F002B] font-medium"><FileText size={13} /> View</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(order.notes || order.transportName || order.expectedDate) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 flex flex-col gap-1">
          {order.notes && <div><span className="font-medium">Notes: </span>{order.notes}</div>}
          {order.transportName && <div><span className="font-medium">Transport: </span>{order.transportName}</div>}
          {order.expectedDate && <div><span className="font-medium">Expected: </span>{fmtDate(order.expectedDate)}</div>}
        </div>
      )}

      <ConfirmDialog
        open={cancelOpen}
        danger
        title="Cancel Sales Order"
        confirmLabel="Cancel Order"
        isLoading={busy}
        confirmDisabled={!cancelReason.trim()}
        onCancel={() => { setCancelOpen(false); setCancelReason(''); }}
        onConfirm={cancel}
        impact={
          <div className="flex flex-col gap-2">
            <p>Cancelling <strong>{order.docNo}</strong> releases its reserved quantities back to ATP.</p>
            <label className="text-xs font-medium text-slate-600">Reason (required)</label>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
        }
      />
    </div>
  );
}
