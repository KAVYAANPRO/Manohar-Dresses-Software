import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Printer, CreditCard, Ban, MessageCircle, RotateCcw, CheckCircle } from 'lucide-react';
import { ConfirmDialog } from '../../components/feedback/ConfirmDialog';
import { WhatsAppShareDialog } from '../../components/feedback/WhatsAppShareDialog';
import { Can, RestrictedValue } from '../../lib/permissions/Can';
import { invoicesApi, payStatusLabel, modeLabel, apiErrorMessage, fmtDate, inr, type InvoiceView } from '../../lib/api/sales';
import { ErrorBanner, Spinner } from './shared';
import { STAGGER_CHILDREN } from '../pageKit';
import { AnimatedNumber } from '../../components/motion';

const payStatusCls: Record<string, string> = {
  Unpaid: 'bg-red-100 text-red-700',
  'Partially Paid': 'bg-amber-100 text-amber-700',
  Paid: 'bg-green-100 text-green-700',
};

export function InvoiceDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);

  const load = () => {
    if (!id) return;
    invoicesApi.get(id)
      .then(setInvoice)
      .catch(e => setError(apiErrorMessage(e, 'Could not load this invoice.')))
      .finally(() => setIsLoading(false));
  };
  useEffect(load, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) return <Spinner />;
  if (!invoice) return <div className="p-6"><ErrorBanner message={error || 'Invoice not found.'} /></div>;

  const isDraft = invoice.status === 'DRAFT';
  const isCancelled = invoice.status === 'CANCELLED';
  const payLabel = payStatusLabel[invoice.paymentStatus];
  const interstate = !invoice.isIntraState;
  const expenses = invoice.otherCharges ?? 0;
  const anyReturnable = invoice.lines.some(l => l.returnableQty > 0);

  const handleCancelInvoice = async () => {
    if (!cancelReason.trim()) return;
    setBusy(true); setError('');
    try {
      await invoicesApi.cancel(invoice._id, cancelReason.trim());
      setCancelOpen(false); setCancelReason(''); load();
    } catch (e) { setError(apiErrorMessage(e)); setCancelOpen(false); } finally { setBusy(false); }
  };
  const confirmDraft = async () => {
    setBusy(true); setError('');
    try { await invoicesApi.confirm(invoice._id); load(); } catch (e) { setError(apiErrorMessage(e)); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-start gap-3 flex-wrap">
        <button onClick={() => navigate('/sales/invoices')} className="flex items-center justify-center w-10 h-10 shrink-0 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 break-all">{isDraft ? 'Draft Invoice' : invoice.docNo}</h1>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${isCancelled ? 'bg-red-100 text-red-700' : isDraft ? 'bg-slate-100 text-slate-600' : payStatusCls[payLabel]}`}>
              {isCancelled ? 'Cancelled' : isDraft ? 'Draft' : payLabel}
            </span>
            <span className="px-2 py-1 rounded-full text-xs font-medium transition-colors bg-[#FFDCE5] text-[#B80037]">{interstate ? 'Interstate (IGST)' : 'Intrastate (CGST+SGST)'}</span>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            {invoice.customerName} · {fmtDate(invoice.docDate)}
            {invoice.salesOrderNo && <> · SO: {invoice.salesOrderNo}</>}
            {invoice.deliveryChallanNo && <> · Challan: {invoice.deliveryChallanNo}</>}
          </p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 w-full md:w-auto">
          {isDraft && (
            <Can perm="invoices.confirm">
              <button onClick={confirmDraft} disabled={busy}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-[#E40043] text-white text-sm font-medium rounded-lg disabled:opacity-60">
                <CheckCircle size={15} /> {busy ? 'Confirming…' : 'Confirm & Deduct Stock'}
              </button>
            </Can>
          )}
          {invoice.status === 'CONFIRMED' && invoice.outstanding > 0 && (
            <Can perm="payments.create">
              <button onClick={() => navigate(`/sales/payments/new?invoiceId=${invoice._id}`)}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700">
                <CreditCard size={15} /> Record Payment
              </button>
            </Can>
          )}
          {invoice.status === 'CONFIRMED' && anyReturnable && (
            <Can perm="invoices.edit">
              <button onClick={() => navigate(`/sales/returns/new?invoiceId=${invoice._id}`)}
                className="flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
                <RotateCcw size={15} /> Sales Return
              </button>
            </Can>
          )}
          <button onClick={() => window.print()} className="flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
            <Printer size={15} /> Print
          </button>
          {!isDraft && (
            <button onClick={() => setWhatsappOpen(true)} className="flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 border border-green-200 text-green-700 text-sm font-medium rounded-lg hover:bg-green-50">
              <MessageCircle size={15} /> Send on WhatsApp
            </button>
          )}
          {invoice.status === 'CONFIRMED' && (
            <Can perm="invoices.cancel">
              <button onClick={() => setCancelOpen(true)}
                className="col-span-2 sm:col-span-1 w-full sm:w-auto flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50">
                <Ban size={15} /> Cancel Invoice
              </button>
            </Can>
          )}
        </div>
      </div>

      <ErrorBanner message={error} onClose={() => setError('')} />

      {isDraft && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          This invoice is a draft: no number has been issued and no stock has moved. Amounts are calculated at confirmation.
        </div>
      )}
      {isCancelled && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
          This invoice was cancelled{invoice.cancelReason ? ` (${invoice.cancelReason})` : ''}. Its stock effect has been reversed with a new ledger entry — the original invoice and its number are kept, never deleted.
        </div>
      )}

      <ConfirmDialog
        open={cancelOpen}
        danger
        title="Cancel Invoice"
        confirmLabel="Cancel Invoice"
        isLoading={busy}
        confirmDisabled={!cancelReason.trim()}
        onCancel={() => { setCancelOpen(false); setCancelReason(''); }}
        onConfirm={handleCancelInvoice}
        impact={
          <div className="flex flex-col gap-2">
            <p>Cancelling <strong>{invoice.docNo}</strong> will reverse the stock deduction — <strong>{invoice.totalQty} pcs</strong> go back — and mark the invoice Cancelled. The number is kept. Payments must be unallocated first; invoices with a sales return cannot be cancelled.</p>
            <label className="text-xs font-medium text-slate-600">Reason (required)</label>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2} placeholder="e.g. Raised against the wrong customer"
              className="w-full text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
        }
      />

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-4 md:px-6 md:py-5 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-base sm:text-lg font-bold break-words text-slate-900">TAX INVOICE</div>
              <div className="text-sm text-slate-700">{invoice.company?.legalName}</div>
              <div className="text-sm text-slate-500 mt-0.5 break-all">GSTIN: {invoice.company?.gstin ?? '—'}</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold text-slate-900">{isDraft ? 'DRAFT' : invoice.docNo}</div>
              <div className="text-sm text-slate-500">{fmtDate(invoice.docDate)}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Bill To</div>
              <div className="font-semibold text-slate-900">{invoice.customerName}</div>
              <div className="text-slate-600 break-words">{invoice.customerAddress}</div>
              <div className="text-slate-500 text-xs mt-1 break-all">GSTIN: {invoice.customerGstin ?? '—'}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Details</div>
              <div className="text-slate-700"><span className="font-medium">Place of Supply:</span> {invoice.placeOfSupply ?? '—'}</div>
              {invoice.salesOrderNo && <div className="text-slate-700"><span className="font-medium">SO Reference:</span> {invoice.salesOrderNo}</div>}
              <div className="text-slate-700"><span className="font-medium">Tax Type:</span> {interstate ? 'IGST' : 'CGST + SGST'}</div>
              {invoice.agentNameSnapshot && (
                <div className="text-slate-700"><span className="font-medium">Agent:</span> {invoice.agentNameSnapshot}{' '}
                  <RestrictedValue perm="invoices.rate.view">({invoice.commissionPct}% · {inr(invoice.commissionAmount)})</RestrictedValue>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold">#</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold">Item Description</th>
                <th className="px-3 py-2 text-left text-xs text-slate-500 font-semibold">HSN</th>
                <th className="px-3 py-2 text-center text-xs text-slate-500 font-semibold">Qty</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">Rate</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">Disc.</th>
                <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">Taxable</th>
                {interstate ? (
                  <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">IGST</th>
                ) : (
                  <>
                    <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">CGST</th>
                    <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">SGST</th>
                  </>
                )}
                <th className="px-3 py-2 text-right text-xs text-slate-500 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, idx) => (
                <tr key={l._id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-900">{l.designNo ?? l.designName} / {l.colourName} / {l.sizeName}</div>
                    <div className="text-xs text-slate-400 font-mono">{l.designNo}{l.categoryName ? ` · ${l.categoryName}` : ''}{l.returnedQty > 0 ? ` · ${l.returnedQty} returned` : ''}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{l.hsn}</td>
                  <td className="px-3 py-3 text-center text-slate-700">{l.qty}</td>
                  <td className="px-3 py-3 text-right text-slate-700">{inr(l.unitRate)}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{inr(l.discountAmount)}</td>
                  <td className="px-3 py-3 text-right font-medium text-slate-900">{inr(l.taxableValue)}</td>
                  {interstate ? (
                    <td className="px-3 py-3 text-right text-slate-700"><div>{inr(l.igst)}</div><div className="text-xs text-slate-400">{l.taxRatePct}%</div></td>
                  ) : (
                    <>
                      <td className="px-3 py-3 text-right text-slate-700"><div>{inr(l.cgst)}</div><div className="text-xs text-slate-400">{l.taxRatePct / 2}%</div></td>
                      <td className="px-3 py-3 text-right text-slate-700"><div>{inr(l.sgst)}</div><div className="text-xs text-slate-400">{l.taxRatePct / 2}%</div></td>
                    </>
                  )}
                  <td className="px-3 py-3 text-right font-semibold text-slate-900">{inr(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={`md:hidden flex flex-col gap-3 p-3 ${STAGGER_CHILDREN}`}>
          {invoice.lines.map((l, idx) => (
            <div key={l._id} className="flex flex-col gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-slate-900 break-words"><span className="text-slate-400 mr-1">{idx + 1}.</span>{l.designNo ?? l.designName} / {l.colourName} / {l.sizeName}</div>
                  <div className="text-xs text-slate-400 font-mono">{l.designNo} · HSN {l.hsn}{l.returnedQty > 0 ? ` · ${l.returnedQty} returned` : ''}</div>
                </div>
                <div className="text-right shrink-0"><div className="text-xs font-medium text-muted">Total</div><div className="text-sm font-semibold text-slate-900">{inr(l.lineTotal)}</div></div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs font-medium text-muted">Qty</div><div className="text-slate-700">{l.qty}</div></div>
                <div><div className="text-xs font-medium text-muted">Rate</div><div className="text-slate-700">{inr(l.unitRate)}</div></div>
                <div><div className="text-xs font-medium text-muted">Disc.</div><div className="text-slate-600">{inr(l.discountAmount)}</div></div>
                <div><div className="text-xs font-medium text-muted">Taxable</div><div className="font-medium text-slate-900">{inr(l.taxableValue)}</div></div>
                {interstate ? (
                  <div><div className="text-xs font-medium text-muted">IGST ({l.taxRatePct}%)</div><div className="text-slate-700">{inr(l.igst)}</div></div>
                ) : (
                  <>
                    <div><div className="text-xs font-medium text-muted">CGST ({l.taxRatePct / 2}%)</div><div className="text-slate-700">{inr(l.cgst)}</div></div>
                    <div><div className="text-xs font-medium text-muted">SGST ({l.taxRatePct / 2}%)</div><div className="text-slate-700">{inr(l.sgst)}</div></div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="px-4 py-4 md:px-6 border-t border-slate-100 bg-slate-50">
          <Can perm="invoices.rate.view" fallback={<p className="text-sm text-slate-400 italic text-right">Amounts restricted</p>}>
            <div className="ml-auto max-w-xs space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-medium text-slate-900">{inr(invoice.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="font-medium text-red-600">−{inr(invoice.discountTotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Taxable Amount</span><span className="font-medium text-slate-900">{inr(invoice.taxableTotal)}</span></div>
              {interstate
                ? <div className="flex justify-between"><span className="text-slate-500">IGST</span><span className="font-medium text-slate-900">{inr(invoice.igstTotal)}</span></div>
                : <>
                    <div className="flex justify-between"><span className="text-slate-500">CGST</span><span className="font-medium text-slate-900">{inr(invoice.cgstTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">SGST</span><span className="font-medium text-slate-900">{inr(invoice.sgstTotal)}</span></div>
                  </>}
              {expenses > 0 && <div className="flex justify-between"><span className="text-slate-500">Expenses (if any)</span><span className="font-medium text-slate-900">{inr(expenses)}</span></div>}
              {invoice.roundOff !== 0 && <div className="flex justify-between"><span className="text-slate-500">Round Off</span><span className="font-medium text-slate-600">{invoice.roundOff > 0 ? '+' : ''}{inr(invoice.roundOff)}</span></div>}
              <div className="flex justify-between items-baseline gap-2 pt-2 border-t border-slate-200">
                <span className="font-bold text-slate-900">Invoice Total</span>
                <span className="font-bold text-lg md:text-xl text-slate-900 text-right">{inr(invoice.grandTotal)}</span>
              </div>
            </div>
          </Can>
        </div>
      </div>

      {invoice.status === 'CONFIRMED' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Status</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${payStatusCls[payLabel]}`}>{payLabel}</span>
          </div>
          <div className="px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
              <div className="text-center min-w-0"><div className="text-xs text-slate-400 mb-0.5">Invoice Amount</div><div className="text-base sm:text-lg font-bold break-words text-slate-900"><RestrictedValue perm="invoices.rate.view"><AnimatedNumber value={invoice.grandTotal} format={inr} /></RestrictedValue></div></div>
              <div className="text-center min-w-0"><div className="text-xs text-slate-400 mb-0.5">Paid</div><div className="text-base sm:text-lg font-bold break-words text-green-700"><RestrictedValue perm="invoices.rate.view"><AnimatedNumber value={invoice.paidAmount} format={inr} /></RestrictedValue></div></div>
              <div className="text-center min-w-0"><div className="text-xs text-slate-400 mb-0.5">Credit Notes</div><div className="text-base sm:text-lg font-bold break-words text-purple-700"><RestrictedValue perm="invoices.rate.view"><AnimatedNumber value={invoice.creditedAmount} format={inr} /></RestrictedValue></div></div>
              <div className="text-center min-w-0"><div className="text-xs text-slate-400 mb-0.5">Balance</div><div className={`text-lg font-bold ${invoice.outstanding > 0 ? 'text-red-600' : 'text-slate-400'}`}><RestrictedValue perm="invoices.rate.view"><AnimatedNumber value={invoice.outstanding} format={inr} /></RestrictedValue></div></div>
            </div>
            {invoice.excessCredit > 0 && (
              <div className="mb-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-xs text-purple-800">Credit of {inr(invoice.excessCredit)} exceeds the amount owed — refundable to the customer.</div>
            )}
            <div className="flex flex-col gap-2">
              {invoice.payments.map(p => (
                <div key={p.paymentId} className="flex items-start justify-between gap-3 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] text-sm">
                  <div className="min-w-0">
                    <div className="text-slate-700">{p.docNo ?? 'Receipt'} · {fmtDate(p.date)} · {modeLabel(p.mode)}</div>
                    {p.reference && <div className="font-mono text-xs text-slate-500 break-all">{p.reference}</div>}
                  </div>
                  <div className="font-semibold text-green-700 shrink-0">{inr(p.amount)}</div>
                </div>
              ))}
              {invoice.creditNotes.map(c => (
                <div key={c._id} className="flex items-start justify-between gap-3 p-3 border border-purple-100 rounded-lg bg-purple-50/40 text-sm">
                  <div className="min-w-0">
                    <div className="text-slate-700">Credit note {c.docNo} · {fmtDate(c.docDate)}</div>
                    <div className="text-xs text-slate-500 break-words">{c.reason}</div>
                  </div>
                  <div className="font-semibold text-purple-700 shrink-0">−{inr(c.total)}</div>
                </div>
              ))}
              {invoice.creditNotes.length > 0 && <Link to="/sales/returns" className="text-xs text-[#E40043] font-medium">View sales returns</Link>}
            </div>
          </div>
        </div>
      )}

      {invoice.notes && <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700"><span className="font-medium">Notes: </span>{invoice.notes}</div>}

      <WhatsAppShareDialog
        open={whatsappOpen}
        title="Send Invoice on WhatsApp"
        message={`Hi ${invoice.customerName},\n\nYour invoice from ${invoice.company?.legalName ?? ''}:\nInvoice No: ${invoice.docNo}\nDate: ${fmtDate(invoice.docDate)}\nAmount: ${inr(invoice.grandTotal)}\nBalance: ${inr(invoice.outstanding)}\nStatus: ${payLabel}\n\nThank you for your business!`}
        onClose={() => setWhatsappOpen(false)}
      />
    </div>
  );
}
