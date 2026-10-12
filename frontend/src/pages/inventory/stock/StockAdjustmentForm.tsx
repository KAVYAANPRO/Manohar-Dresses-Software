import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { ArrowLeft, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { ConfirmDialog } from '../../../components/feedback/ConfirmDialog';
import { Can } from '../../../lib/permissions/Can';
import { stockApi, stockAdjustmentsApi, fmtQty, type StockRow, type StockAdjustmentRow } from '../../../lib/api/inventory';
import { problemMessage, formatDate } from '../../../lib/api/procurement';
import { PickerSheet, PickerField, type PickerItem } from '../../../components/forms/PickerSheet';
import { DraftBanner } from '../../../components/feedback/DraftBanner';
import { useDraft } from '../../../lib/drafts/useDraft';
import { submitOrQueue } from '../../../lib/offline/submitOrQueue';

const selectClass = 'w-full px-3 py-2 text-base md:text-sm border border-slate-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E40043]';

export function StockAdjustmentForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isView = Boolean(id);

  const [rows, setRows] = useState<StockRow[]>([]);
  const [doc, setDoc] = useState<StockAdjustmentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [balanceId, setBalanceId] = useState('');
  const [adjustedQty, setAdjustedQty] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConfirm, setShowConfirm] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showApprove, setShowApprove] = useState(false);
  const [lotPickerOpen, setLotPickerOpen] = useState(false);
  const [queuedMsg, setQueuedMsg] = useState('');

  const draft = useDraft(
    'stock-adjustment:new',
    { balanceId, adjustedQty, reason },
    d => { setBalanceId(d.balanceId); setAdjustedQty(d.adjustedQty); setReason(d.reason); },
    { enabled: !loading && !isView, isEmpty: d => !d.balanceId && !d.adjustedQty && !d.reason.trim() },
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (id) {
          const list = await stockAdjustmentsApi.list();
          if (!active) return;
          setDoc(list.find(a => a._id === id) ?? null);
          if (!list.find(a => a._id === id)) setError('Stock adjustment not found.');
        } else {
          const ov = await stockApi.overview();
          if (!active) return;
          setRows(ov.rows.filter(r => r.locationKind === 'WAREHOUSE' || r.locationKind === 'QUARANTINE'));
        }
      } catch (err) {
        if (active) setError(problemMessage(err, 'Could not load stock.'));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [id]);

  const current = useMemo(() => rows.find(r => r.id === balanceId), [rows, balanceId]);
  const adjustedNum = parseFloat(adjustedQty);
  const difference = current && !isNaN(adjustedNum) ? +(adjustedNum - current.qty).toFixed(3) : 0;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!current) errs.item = 'Please select a material lot.';
    if (adjustedQty === '') errs.adjustedQty = 'Adjusted quantity is required.';
    else if (adjustedNum < 0) errs.adjustedQty = 'Stock cannot go negative.';
    else if (difference === 0) errs.adjustedQty = 'The counted quantity equals current stock — nothing to adjust.';
    if (!reason.trim()) errs.reason = 'Reason is required for all adjustments.';
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setShowConfirm(true);
  };

  const submit = async () => {
    if (!current) return;
    setShowConfirm(false);
    setSaving(true);
    try {
      // STK-05 signed: a shortfall removes qty from the counted lot; a surplus enters as a new lot at the same unit cost.
      const body = difference < 0
        ? { stockItemId: current.stockItemId, locationId: current.locationId, direction: 'OUT', qty: -difference, lotId: current.lotId, reason: reason.trim() }
        : { stockItemId: current.stockItemId, locationId: current.locationId, direction: 'IN', qty: difference, unitCost: current.unitCost, reason: reason.trim() };
      const res = await submitOrQueue<StockAdjustmentRow>({
        method: 'POST',
        url: '/stock/adjustments',
        body,
        label: `Stock adjustment · ${current.name} · lot ${current.lotNo} · ${difference > 0 ? '+' : ''}${fmtQty(difference)} ${current.uomCode ?? ''}`,
      });
      draft.clear();
      if (res.queued) {
        setQueuedMsg("Saved on this device — it will be sent when you're back online.");
        window.setTimeout(() => navigate('/inventory/adjustments'), 1800);
        return;
      }
      navigate(`/inventory/adjustments/${res.data._id}`, { replace: true });
    } catch (err) {
      setError(problemMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    const list = await stockAdjustmentsApi.list();
    setDoc(list.find(a => a._id === id) ?? null);
  };
  const approve = async () => {
    if (!doc) return;
    setShowApprove(false);
    setSaving(true);
    try { await stockAdjustmentsApi.approve(doc._id); await reload(); setError(''); }
    catch (err) { setError(problemMessage(err)); }
    finally { setSaving(false); }
  };
  const reject = async () => {
    if (!doc) return;
    setSaving(true);
    try { await stockAdjustmentsApi.reject(doc._id, rejectReason.trim()); setShowReject(false); await reload(); setError(''); }
    catch (err) { setShowReject(false); setError(problemMessage(err)); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="spinner !border-primary" style={{ borderTopColor: 'transparent' }} /></div>;
  }

  const header = (title: string, sub: string) => (
    <div className="flex items-center gap-3">
      <button onClick={() => navigate('/inventory/adjustments')} className="flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
        <ArrowLeft size={20} />
      </button>
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{sub}</p>
      </div>
    </div>
  );

  if (isView) {
    const signedQty = doc ? (doc.direction === 'OUT' ? -doc.qty : doc.qty) : 0;
    const statusCls = doc?.status === 'APPROVED' ? 'bg-green-100 text-green-800' : doc?.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800';
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        {header(doc?.docNo ?? 'Stock Adjustment', doc ? `Raised ${formatDate(doc.docDate)}${doc.createdByName ? ` by ${doc.createdByName}` : ''}` : '')}
        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
        {doc && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 break-words">{doc.itemName}</div>
                <div className="text-xs text-slate-500">{doc.locationName} · lot {doc.lotNo ?? (doc.direction === 'IN' ? 'new lot on approval' : '—')}</div>
              </div>
              <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${statusCls}`}>
                {doc.status === 'PROPOSED' ? 'Pending Approval' : doc.status === 'APPROVED' ? 'Approved' : 'Rejected'}
              </span>
            </div>
            <div className={`text-2xl font-bold ${signedQty < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {signedQty > 0 ? '+' : ''}{fmtQty(signedQty)} {doc.uomCode ?? ''}
            </div>
            <div className="text-sm"><span className="text-xs font-medium text-muted block">Reason</span>{doc.reason}</div>
            {doc.status === 'APPROVED' && <div className="text-sm text-slate-600">Approved{doc.approvedByName ? ` by ${doc.approvedByName}` : ''} — posted to the stock ledger.</div>}
            {doc.status === 'REJECTED' && <div className="text-sm text-red-700">Rejected{doc.rejectedByName ? ` by ${doc.rejectedByName}` : ''}{doc.cancelReason ? ` — ${doc.cancelReason}` : ''}.</div>}
            {doc.status === 'PROPOSED' && (
              <Can perm="adjustments.approve" fallback={<p className="text-sm text-slate-500">Waiting for a manager to approve. Nothing is posted until then.</p>}>
                <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100">
                  <Button className="w-full sm:w-auto" onClick={() => setShowApprove(true)} isLoading={saving}>Approve & Post</Button>
                  <Button className="w-full sm:w-auto" variant="danger" onClick={() => setShowReject(true)}>Reject</Button>
                </div>
              </Can>
            )}
          </div>
        )}
        <ConfirmDialog
          open={showApprove}
          title="Approve Stock Adjustment"
          impact={doc ? `Post ${signedQty > 0 ? '+' : ''}${fmtQty(signedQty)} ${doc.uomCode ?? ''} of ${doc.itemName} at ${doc.locationName}? This writes to the stock ledger and cannot be edited afterwards.` : ''}
          confirmLabel="Approve & Post"
          isLoading={saving}
          onConfirm={approve}
          onCancel={() => setShowApprove(false)}
        />
        <ConfirmDialog
          open={showReject}
          title="Reject Stock Adjustment"
          impact={<div className="flex flex-col gap-2"><span>Reject this adjustment? Stock is not changed.</span><textarea className="input-field min-h-[70px]" placeholder="Reason (required)" value={rejectReason} onChange={e => setRejectReason(e.target.value)} /></div>}
          confirmLabel="Reject"
          danger
          isLoading={saving}
          confirmDisabled={!rejectReason.trim()}
          onConfirm={reject}
          onCancel={() => setShowReject(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {header('New Stock Adjustment', 'Correct physical discrepancies. Every adjustment creates an audit record and needs approval before it posts.')}
      <DraftBanner restoredAt={draft.restoredAt} onDiscard={() => { draft.clear(); setBalanceId(''); setAdjustedQty(''); setReason(''); }} />
      {queuedMsg && <p role="status" className="animate-fade-in text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-4 py-3">{queuedMsg}</p>}
      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 md:p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <PickerField
              label={<span className="text-slate-700">Material lot *</span>}
              value={current?.name}
              hint={current ? `Lot ${current.lotNo} · ${current.locationName} · ${fmtQty(current.qty)} ${current.uomCode ?? ''}` : undefined}
              placeholder="Tap to choose material / lot"
              onOpen={() => setLotPickerOpen(true)}
            />
            {rows.length === 0 && <span className="text-xs text-slate-500">No stock on hand yet — stock enters through a purchase inward.</span>}
            {errors.item && <span className="text-xs text-red-500">{errors.item}</span>}
          </div>

          {current && (
            <div className="bg-slate-50 rounded-lg p-4 flex flex-col gap-2 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Stock</div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-bold text-slate-900">{fmtQty(current.qty)}</span>
                <span className="text-slate-500">{current.uomCode}</span>
                <span className="text-xs font-mono text-slate-400 ml-2">{current.lotNo} · {current.locationName}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Counted (adjusted) quantity *</label>
            <input
              type="number" inputMode="decimal" min="0" step="0.001"
              className={`${selectClass} ${errors.adjustedQty ? 'border-red-400' : ''}`}
              value={adjustedQty}
              onChange={e => setAdjustedQty(e.target.value)}
              placeholder="Enter the physically counted quantity"
              disabled={!current}
            />
            {errors.adjustedQty && <span className="text-xs text-red-500">{errors.adjustedQty}</span>}
          </div>

          {current && adjustedQty !== '' && !isNaN(adjustedNum) && (
            <div className={`rounded-lg p-4 border ${difference === 0 ? 'bg-slate-50 border-slate-200' : difference < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Effect</div>
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <span className="font-medium text-slate-700">{fmtQty(current.qty)} {current.uomCode}</span>
                <span className="text-slate-400">→</span>
                <span className="font-bold text-slate-900">{fmtQty(adjustedNum)} {current.uomCode}</span>
                {difference !== 0 && (
                  <span className={`flex items-center gap-1 text-xs font-semibold ${difference < 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {difference < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                    {difference > 0 ? '+' : ''}{fmtQty(difference)} {current.uomCode}
                  </span>
                )}
              </div>
              {difference > 0 && <div className="mt-2 text-xs text-slate-600">A surplus is added as a new lot at this lot's unit cost.</div>}
              <div className="mt-3 flex items-center gap-2 text-xs text-orange-700">
                <AlertTriangle size={13} /> Needs manager approval before it is posted to the ledger.
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Reason *</label>
            <textarea
              className={`w-full px-3 py-2 text-base md:text-sm border rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#E40043] ${errors.reason ? 'border-red-400' : 'border-slate-200'}`}
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this adjustment is needed (e.g. physical count, damage, entry error)..."
            />
            {errors.reason && <span className="text-xs text-red-500">{errors.reason}</span>}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button className="w-full sm:w-auto" type="submit" variant="primary" isLoading={saving}>Submit for Approval</Button>
          <Button className="w-full sm:w-auto" type="button" variant="secondary" onClick={() => navigate('/inventory/adjustments')}>Cancel</Button>
        </div>
      </form>

      <PickerSheet
        open={lotPickerOpen}
        title="Choose material lot"
        items={rows.map((r): PickerItem => ({
          id: r.id,
          title: r.name,
          subtitle: [`Lot ${r.lotNo}`, r.locationName ?? r.locationCode].filter(Boolean).join(' · '),
          meta: `${fmtQty(r.qty)} ${r.uomCode ?? ''}`,
          keywords: `${r.lotNo} ${r.locationCode}`,
        }))}
        selectedId={balanceId}
        searchPlaceholder="Search material, colour or lot no…"
        emptyText="No stock on hand matches — stock enters through a purchase inward."
        onSelect={it => { setBalanceId(it.id); setAdjustedQty(''); setErrors({}); setLotPickerOpen(false); }}
        onClose={() => setLotPickerOpen(false)}
      />

      {current && (
        <ConfirmDialog
          open={showConfirm}

          title="Submit Stock Adjustment"
          impact={
            <>
              {current.name} ({current.lotNo}): <strong>{fmtQty(current.qty)} {current.uomCode}</strong> → <strong>{fmtQty(adjustedNum)} {current.uomCode}</strong>{' '}
              (<span className={difference < 0 ? 'text-red-600' : 'text-green-600'}>{difference > 0 ? '+' : ''}{fmtQty(difference)} {current.uomCode}</span>).
              It will be sent for manager approval before posting.
            </>
          }
          confirmLabel="Submit for Approval"
          isLoading={saving}
          onConfirm={submit}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
