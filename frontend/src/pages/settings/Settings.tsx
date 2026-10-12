import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Building2, Calculator, Hash, Shield, X } from 'lucide-react';
import { settingsApi, previewNumber, type CompanySettings, type NumberSeries, type RoleRecord, type TaxRule } from '../../lib/api/settings';
import { usersApi } from '../../lib/api/users';
import { apiErrorMessage, fmtDate } from '../../lib/api/insights';
import { usePermission } from '../../lib/permissions/usePermission';
import { TabPill, TabPanel } from '../pageKit';

type Tab = 'company' | 'tax' | 'numbering' | 'roles';

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E40043]';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{message}</div>;
}

function Spinner() {
  return <div className="flex justify-center p-10"><div className="w-7 h-7 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
}

// ---------------- Company ----------------

const NUMBER_FIELDS: Array<{ key: keyof CompanySettings; label: string; hint: string; min?: number; max?: number }> = [
  { key: 'shortageTolerancePct', label: 'Shortage Tolerance (%)', hint: 'Jobs whose material shortage exceeds this raise a "High shortage" alert (SHR-03). 0 = off.', min: 0, max: 100 },
  { key: 'overReceiptTolerancePct', label: 'Over-receipt Tolerance (%)', hint: 'Inward beyond the ordered quantity by more than this is blocked.', min: 0, max: 100 },
  { key: 'pendingJobAlertDays', label: 'Pending Job Alert (days)', hint: 'Alert when a job slip is still open after this many days.', min: 1, max: 365 },
  { key: 'materialPendingAlertDays', label: 'Material With Factory Alert (days)', hint: 'Alert when issued material is still with a factory after this many days.', min: 1, max: 365 },
  { key: 'pendingInwardAlertDays', label: 'Pending Inward Alert (days)', hint: 'Alert when a confirmed purchase is not fully received after this many days.', min: 1, max: 365 },
  { key: 'pendingSalesOrderAlertDays', label: 'Pending Sales Order Alert (days)', hint: 'Alert when a confirmed order is not invoiced after this many days.', min: 1, max: 365 },
  { key: 'defaultPaymentTermsDays', label: 'Default Payment Terms (days)', hint: "Used for the overdue-payment alert when a customer's terms don't state days.", min: 0, max: 365 },
];

function CompanyTab() {
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    settingsApi.getCompany()
      .then(c => setCompany(c ?? { legalName: '', state: '', currentFinancialYear: '' }))
      .catch(err => setError(apiErrorMessage(err, 'Could not load company settings.')))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <Spinner />;
  if (!company) return <ErrorBox message={error} />;

  const set = (k: keyof CompanySettings, v: string | number | undefined) => setCompany(p => (p ? { ...p, [k]: v } : p));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSaved(false);
    try {
      const body: Partial<CompanySettings> = {
        legalName: company.legalName,
        gstin: company.gstin || undefined,
        state: company.state,
        address: company.address ?? '',
        email: company.email || undefined,
        phone: company.phone ?? '',
        ownerWhatsapp: company.ownerWhatsapp ?? '',
        financialYearStart: company.financialYearStart || undefined,
        currentFinancialYear: company.currentFinancialYear,
      };
      for (const f of NUMBER_FIELDS) {
        const v = company[f.key];
        if (v !== undefined && v !== null && v !== ('' as unknown)) (body as Record<string, unknown>)[f.key] = Number(v);
      }
      setCompany(await settingsApi.updateCompany(body));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save company settings.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="max-w-3xl flex flex-col gap-4">
      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">Company Profile & Legal Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>Legal Name <span className="text-red-500">*</span></label>
            <input type="text" value={company.legalName} onChange={e => set('legalName', e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>GSTIN</label>
            <input type="text" value={company.gstin ?? ''} onChange={e => set('gstin', e.target.value.toUpperCase())} maxLength={15} className={`${inputCls} font-mono`} />
          </div>
          <div>
            <label className={labelCls}>State <span className="text-red-500">*</span></label>
            <input type="text" value={company.state} onChange={e => set('state', e.target.value)} required className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Address</label>
            <textarea value={company.address ?? ''} onChange={e => set('address', e.target.value)} rows={2} className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" value={company.email ?? ''} onChange={e => set('email', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Phone</label>
            <input type="text" value={company.phone ?? ''} onChange={e => set('phone', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Owner's WhatsApp Number</label>
            <input type="text" value={company.ownerWhatsapp ?? ''} onChange={e => set('ownerWhatsapp', e.target.value)} placeholder="+91 98765 43210" className={inputCls} />
            <p className="text-xs text-slate-400 mt-1">Stored for business alerts; in-app alerts are live now, WhatsApp delivery is a later release.</p>
          </div>
          <div>
            <label className={labelCls}>Financial Year Start (MM-DD)</label>
            <input type="text" value={company.financialYearStart ?? '04-01'} onChange={e => set('financialYearStart', e.target.value)} placeholder="04-01 = 1 April" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Current Financial Year <span className="text-red-500">*</span></label>
            <input type="text" value={company.currentFinancialYear} onChange={e => set('currentFinancialYear', e.target.value)} placeholder="26-27" required className={`${inputCls} font-mono`} />
            <p className="text-xs text-slate-400 mt-1">Used in every new document number (e.g. INV/26-27/00001).</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-1">Tolerances & Alert Thresholds</h2>
        <p className="text-xs text-slate-400 mb-4">These drive the bell alerts and dashboard warnings (prd.md §6.3).</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {NUMBER_FIELDS.map(f => (
            <div key={f.key}>
              <label className={labelCls}>{f.label}</label>
              <input type="number" inputMode="decimal" min={f.min} max={f.max} step={f.key.endsWith('Pct') ? '0.1' : '1'}
                value={(company[f.key] as number | undefined) ?? ''} onChange={e => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} className={inputCls} />
              <p className="text-xs text-slate-400 mt-1">{f.hint}</p>
            </div>
          ))}
        </div>
      </div>

      <ErrorBox message={error} />
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-5 py-2.5 md:py-2 bg-[#E40043] text-white rounded-lg hover:bg-[#B80037] text-sm font-medium disabled:opacity-60">
          {isSaving ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-sm text-green-600 font-medium">Saved.</span>}
      </div>
    </form>
  );
}

// ---------------- Tax rules ----------------

interface TaxForm { hsn: string; valueBandMin: string; valueBandMax: string; ratePct: string; validFrom: string; validTo: string; notes: string }
const emptyTax: TaxForm = { hsn: '', valueBandMin: '0', valueBandMax: '', ratePct: '', validFrom: new Date().toISOString().slice(0, 10), validTo: '', notes: '' };

function TaxTab() {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<TaxRule | 'new' | null>(null);
  const [form, setForm] = useState<TaxForm>(emptyTax);
  const [isSaving, setIsSaving] = useState(false);

  const load = () => {
    setIsLoading(true);
    settingsApi.listTaxRules()
      .then(r => setRules([...r].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.valueBandMin - b.valueBandMin)))
      .catch(err => setError(apiErrorMessage(err, 'Could not load tax rules.')))
      .finally(() => setIsLoading(false));
  };
  useEffect(load, []);

  const openForm = (r: TaxRule | 'new') => {
    setError('');
    setEditing(r);
    setForm(r === 'new' ? emptyTax : {
      hsn: r.hsn, valueBandMin: String(r.valueBandMin), valueBandMax: r.valueBandMax != null ? String(r.valueBandMax) : '',
      ratePct: String(r.ratePct), validFrom: r.validFrom.slice(0, 10), validTo: r.validTo ? r.validTo.slice(0, 10) : '', notes: r.notes ?? '',
    });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (form.valueBandMax && Number(form.valueBandMax) <= Number(form.valueBandMin)) {
      setError('Value band max must be greater than the minimum.');
      return;
    }
    setIsSaving(true);
    setError('');
    const body: Record<string, unknown> = {
      hsn: form.hsn.trim(),
      valueBandMin: Number(form.valueBandMin || 0),
      ratePct: Number(form.ratePct),
      validFrom: form.validFrom,
      notes: form.notes || undefined,
    };
    if (form.valueBandMax) body.valueBandMax = Number(form.valueBandMax);
    if (form.validTo) body.validTo = form.validTo;
    try {
      if (editing === 'new') await settingsApi.createTaxRule(body as Partial<TaxRule>);
      else if (editing) await settingsApi.updateTaxRule(editing._id, body as Partial<TaxRule>, editing.version);
      setEditing(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the tax rule.'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = async (r: TaxRule) => {
    try {
      await settingsApi.setTaxRuleActive(r._id, !r.isActive);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update the tax rule.'));
    }
  };

  const band = (r: TaxRule) => `₹${r.valueBandMin.toLocaleString('en-IN')} – ${r.valueBandMax != null ? `₹${r.valueBandMax.toLocaleString('en-IN')}` : 'no cap'}`;
  const validity = (r: TaxRule) => `${fmtDate(r.validFrom)}${r.validTo ? ` to ${fmtDate(r.validTo)}` : ' onwards'}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700 min-w-0">Tax Rules (HSN × Value Band)</h2>
        <button onClick={() => openForm('new')} className="shrink-0 py-2 md:py-0 text-sm text-[#E40043] hover:underline">+ Add Rule</button>
      </div>

      {editing && (
        <form onSubmit={save} className="p-4 md:p-5 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">{editing === 'new' ? 'New tax rule' : `Edit rule — HSN ${editing.hsn}`}</h3>
            <button type="button" onClick={() => setEditing(null)} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-200" aria-label="Cancel"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className={labelCls}>HSN *</label><input required value={form.hsn} onChange={e => setForm(f => ({ ...f, hsn: e.target.value }))} className={`${inputCls} font-mono`} /></div>
            <div><label className={labelCls}>GST Rate % *</label><input required type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.ratePct} onChange={e => setForm(f => ({ ...f, ratePct: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Band Min (₹/pc)</label><input type="number" min="0" inputMode="decimal" value={form.valueBandMin} onChange={e => setForm(f => ({ ...f, valueBandMin: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Band Max (₹/pc)</label><input type="number" min="0" inputMode="decimal" placeholder="No cap" value={form.valueBandMax} onChange={e => setForm(f => ({ ...f, valueBandMax: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Valid From *</label><input required type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} className={inputCls} /></div>
            <div><label className={labelCls}>Valid To</label><input type="date" min={form.validFrom} value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} className={inputCls} /></div>
            <div className="col-span-2"><label className={labelCls}>Notes</label><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} /></div>
          </div>
          <ErrorBox message={error} />
          <div className="flex flex-col-reverse sm:flex-row gap-2">
            <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-5 py-2.5 md:py-2 bg-[#E40043] text-white rounded-lg text-sm font-medium disabled:opacity-60">{isSaving ? 'Saving…' : 'Save Rule'}</button>
            <button type="button" onClick={() => setEditing(null)} className="w-full sm:w-auto px-5 py-2.5 md:py-2 border border-slate-200 rounded-lg text-sm">Cancel</button>
          </div>
        </form>
      )}
      {!editing && error && <div className="p-3"><ErrorBox message={error} /></div>}

      {isLoading ? <Spinner /> : rules.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">No tax rules yet. Add one per HSN and value band — invoices cannot be confirmed without a matching rule.</p>
      ) : (
        <>
          <div className="md:hidden flex flex-col gap-2 p-3">
            {rules.map(r => (
              <div key={r._id} className={`flex flex-col gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)] ${r.isActive ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-slate-500">HSN {r.hsn}</p>
                    <p className="text-sm font-medium break-words">{r.notes || band(r)}</p>
                  </div>
                  <button onClick={() => openForm(r)} className="shrink-0 px-2 py-1 text-[#E40043] hover:underline text-sm">Edit</button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><p className="text-xs text-muted">Value band</p><p>{band(r)}</p></div>
                  <div><p className="text-xs text-muted">GST Rate</p><p className="font-medium">{r.ratePct}%</p></div>
                  <div><p className="text-xs text-muted">Validity</p><p className="text-slate-500">{validity(r)}</p></div>
                </div>
                <button onClick={() => toggle(r)} className="self-start text-xs text-slate-500 underline">{r.isActive ? 'Deactivate' : 'Reactivate'}</button>
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>{['HSN', 'Value Band (₹/pc)', 'GST Rate', 'Validity', 'Notes', 'Status', ''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map(r => (
                  <tr key={r._id} className={`hover:bg-slate-50 ${r.isActive ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3 font-mono text-xs">{r.hsn}</td>
                    <td className="px-4 py-3">{band(r)}</td>
                    <td className="px-4 py-3 font-medium">{r.ratePct}%</td>
                    <td className="px-4 py-3 text-slate-500">{validity(r)}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{r.notes}</td>
                    <td className="px-4 py-3 text-xs">{r.isActive ? 'Active' : 'Inactive'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => openForm(r)} className="text-[#E40043] hover:underline text-xs mr-3">Edit</button>
                      <button onClick={() => toggle(r)} className="text-slate-500 hover:underline text-xs">{r.isActive ? 'Deactivate' : 'Reactivate'}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="px-4 md:px-5 py-3 text-xs text-slate-400">
        Tax rules are effective-dated and applied by per-piece taxable value at invoice time. Consult your CA before modifying.
      </p>
    </div>
  );
}

// ---------------- Numbering ----------------

const DOC_LABEL: Record<string, string> = {
  PURCHASE: 'Purchase Order', INWARD: 'Inward', JOB_SLIP: 'Job Slip', MATERIAL_ISSUE: 'Material Issue', MATERIAL_RETURN: 'Material Return',
  JOB_RECEIPT: 'Finished Goods Receipt', INVOICE: 'Sales Invoice', SALES_ORDER: 'Sales Order', PAYMENT: 'Payment', STOCK_ADJUSTMENT: 'Stock Adjustment',
  CREDIT_NOTE: 'Credit Note', DEBIT_NOTE: 'Debit Note', DELIVERY_CHALLAN: 'Delivery Challan', EXHIBITION_ORDER: 'Exhibition Order',
};

function NumberingTab() {
  const [series, setSeries] = useState<NumberSeries[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<{ id: string; prefix: string; pad: string } | null>(null);

  const load = () => {
    setIsLoading(true);
    settingsApi.listSeries()
      .then(setSeries)
      .catch(err => setError(apiErrorMessage(err, 'Could not load number series.')))
      .finally(() => setIsLoading(false));
  };
  useEffect(load, []);

  const save = async () => {
    if (!edit) return;
    setError('');
    try {
      await settingsApi.updateSeries(edit.id, { prefix: edit.prefix.trim(), pad: Number(edit.pad) });
      setEdit(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not update this series.'));
    }
  };

  const issued = (s: NumberSeries) => s.nextNo - 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 md:px-5 py-3 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-700">Document Number Series</h2>
        <p className="text-xs text-slate-400 mt-0.5">Gapless and sequential per financial year (GST SAL-06; invoice numbers ≤ 16 characters). A series' format can be changed only before its first number is issued; the counter itself is never editable.</p>
      </div>
      {error && <div className="p-3"><ErrorBox message={error} /></div>}
      {isLoading ? <Spinner /> : series.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">No series yet — each is created automatically the first time its document is numbered.</p>
      ) : (
        <>
          <div className="md:hidden flex flex-col gap-2 p-3">
            {series.map(s => (
              <div key={s._id} className="flex flex-col gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium min-w-0 break-words">{DOC_LABEL[s.docType] ?? s.docType} <span className="text-xs text-slate-400">FY {s.fy}</span></p>
                  <p className="shrink-0 font-mono text-xs text-slate-600">Next: {previewNumber(s)}</p>
                </div>
                {edit?.id === s._id ? (
                  <div className="grid grid-cols-3 gap-2 items-end">
                    <div><p className="text-xs text-muted">Prefix</p><input value={edit.prefix} onChange={e => setEdit({ ...edit, prefix: e.target.value })} className={`${inputCls} font-mono`} /></div>
                    <div><p className="text-xs text-muted">Pad</p><input type="number" min="1" max="8" value={edit.pad} onChange={e => setEdit({ ...edit, pad: e.target.value })} className={inputCls} /></div>
                    <div className="flex gap-1"><button onClick={save} className="px-3 py-2.5 bg-[#E40043] text-white rounded-lg text-sm">Save</button><button onClick={() => setEdit(null)} className="px-2 py-2.5 border rounded-lg text-sm">✕</button></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 text-sm items-center">
                    <div><p className="text-xs text-muted">Prefix</p><p className="font-mono text-xs break-all">{s.prefix}</p></div>
                    <div><p className="text-xs text-muted">Issued</p><p>{issued(s)}</p></div>
                    <div><p className="text-xs text-muted">Pad</p><p>{s.pad}</p></div>
                    {issued(s) === 0 && <button onClick={() => setEdit({ id: s._id, prefix: s.prefix, pad: String(s.pad) })} className="text-[#E40043] text-sm justify-self-end">Edit</button>}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>{['Document', 'FY', 'Prefix', 'Pad', 'Issued', 'Next Number', ''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {series.map(s => (
                  <tr key={s._id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{DOC_LABEL[s.docType] ?? s.docType}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.fy}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {edit?.id === s._id ? <input value={edit.prefix} onChange={e => setEdit({ ...edit, prefix: e.target.value })} className="w-24 border border-slate-200 rounded px-2 py-1 font-mono text-xs" /> : s.prefix}
                    </td>
                    <td className="px-4 py-3">
                      {edit?.id === s._id ? <input type="number" min="1" max="8" value={edit.pad} onChange={e => setEdit({ ...edit, pad: e.target.value })} className="w-16 border border-slate-200 rounded px-2 py-1 text-xs" /> : s.pad}
                    </td>
                    <td className="px-4 py-3">{issued(s)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{previewNumber(edit?.id === s._id ? { ...s, prefix: edit.prefix, pad: Number(edit.pad) || s.pad } : s)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {edit?.id === s._id ? (
                        <><button onClick={save} className="text-[#E40043] hover:underline mr-3">Save</button><button onClick={() => setEdit(null)} className="text-slate-500 hover:underline">Cancel</button></>
                      ) : issued(s) === 0 ? (
                        <button onClick={() => setEdit({ id: s._id, prefix: s.prefix, pad: String(s.pad) })} className="text-[#E40043] hover:underline">Edit</button>
                      ) : <span className="text-slate-400">Locked (in use)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Roles ----------------

const EXTERNAL_ROLES = new Set(['FACTORY', 'ARTISAN']);

function groupOf(perm: string) {
  return perm.split('.')[0];
}

function RolesTab({ canEdit }: { canEdit: boolean }) {
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [catalogue, setCatalogue] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<RoleRecord | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const load = () => {
    setIsLoading(true);
    Promise.all([
      settingsApi.listRoles(),
      settingsApi.listPermissionKeys(),
      usersApi.list().catch(() => []),
    ])
      .then(([r, perms, users]) => {
        setRoles(r);
        setCatalogue(perms);
        const counts: Record<string, number> = {};
        for (const u of users) for (const k of u.roleKeys) counts[k] = (counts[k] ?? 0) + 1;
        setUserCounts(counts);
      })
      .catch(err => setError(apiErrorMessage(err, 'Could not load roles.')))
      .finally(() => setIsLoading(false));
  };
  useEffect(load, []);

  const open = (r: RoleRecord) => {
    setSelected(r);
    setDraft(new Set(r.permissions));
    setSavedMsg('');
    setError('');
  };
  const isSuper = (r: RoleRecord) => r.permissions.includes('*');

  const save = async () => {
    if (!selected) return;
    setIsSaving(true);
    setError('');
    try {
      const updated = await settingsApi.setRolePermissions(selected.key, Array.from(draft).sort());
      setRoles(prev => prev.map(r => (r.key === updated.key ? updated : r)));
      setSelected(updated);
      setSavedMsg('Saved — takes effect on each user’s next request.');
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save role permissions.'));
    } finally {
      setIsSaving(false);
    }
  };

  const groups = Array.from(new Set(catalogue.map(groupOf)));

  if (isLoading) return <Spinner />;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 md:px-5 py-3 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-700">Roles & Permission Bundles</h2>
          <p className="text-xs text-slate-400 mt-0.5">Default roles (AUTH-04). Individual users can also get extra grants or denials from Team Members.</p>
        </div>
        {!selected && <div className="p-3 empty:hidden"><ErrorBox message={error} /></div>}
        <div className="md:hidden flex flex-col gap-2 p-3">
          {roles.map(r => (
            <div key={r._id} className="flex flex-col gap-2 p-3 border border-[var(--color-border)] rounded-lg bg-[var(--color-background)]">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium min-w-0 break-words">{r.name}</p>
                <span className={`shrink-0 inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${EXTERNAL_ROLES.has(r.key) ? 'bg-amber-100 text-amber-700' : 'bg-[#FFDCE5] text-[#B80037]'}`}>
                  {EXTERNAL_ROLES.has(r.key) ? 'External' : 'Internal'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm"><span className="text-xs text-muted"># Users </span>{userCounts[r.key] ?? 0} · <span className="text-xs text-muted">{isSuper(r) ? 'All permissions' : `${r.permissions.length} permissions`}</span></p>
                <button onClick={() => open(r)} className="shrink-0 px-2 py-1 text-[#E40043] hover:underline text-sm">View Permissions</button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>{['Role', 'Key', 'Type', '# Users', 'Permissions', ''].map(h => <th key={h} className="px-4 py-3 text-left font-semibold">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roles.map(r => (
                <tr key={r._id} className={`hover:bg-slate-50 ${selected?.key === r.key ? 'bg-[#FFF0F3]' : ''}`}>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.key}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${EXTERNAL_ROLES.has(r.key) ? 'bg-amber-100 text-amber-700' : 'bg-[#FFDCE5] text-[#B80037]'}`}>{EXTERNAL_ROLES.has(r.key) ? 'External' : 'Internal'}</span>
                  </td>
                  <td className="px-4 py-3">{userCounts[r.key] ?? 0}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{isSuper(r) ? 'All' : r.permissions.length}</td>
                  <td className="px-4 py-3"><button onClick={() => open(r)} className="text-[#E40043] hover:underline text-xs">{canEdit && !isSuper(r) ? 'Edit Permissions' : 'View Permissions'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="bg-white rounded-xl border border-[#FFB8CA] shadow-sm p-4 md:p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800">{selected.name}</h3>
              <p className="text-xs text-slate-500">{isSuper(selected) ? 'Super Admin always holds every permission and cannot be edited.' : canEdit ? 'Tick the permissions this role grants.' : 'Read-only — you need role management permission to edit.'}</p>
            </div>
            <button onClick={() => setSelected(null)} className="shrink-0 w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={16} /></button>
          </div>
          {!isSuper(selected) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
              {groups.map(g => (
                <div key={g} className="border border-slate-100 rounded-lg p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{g}</p>
                  {catalogue.filter(p => groupOf(p) === g).map(p => (
                    <label key={p} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                      <input type="checkbox" disabled={!canEdit} checked={draft.has(p)}
                        onChange={e => setDraft(prev => { const next = new Set(prev); if (e.target.checked) next.add(p); else next.delete(p); return next; })} />
                      <span className="font-mono text-xs break-all">{p}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <ErrorBox message={error} />
          {canEdit && !isSuper(selected) && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <button onClick={save} disabled={isSaving} className="w-full sm:w-auto px-5 py-2.5 md:py-2 bg-[#E40043] text-white rounded-lg text-sm font-medium disabled:opacity-60">{isSaving ? 'Saving…' : 'Save Permissions'}</button>
              {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const { hasCode } = usePermission();
  const tabs: { id: Tab; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: 'company', label: 'Company Profile', icon: <Building2 size={15} />, visible: hasCode('settings.manage') },
    { id: 'tax', label: 'Tax & HSN Rules', icon: <Calculator size={15} />, visible: hasCode('tax.manage') },
    { id: 'numbering', label: 'Document Numbering', icon: <Hash size={15} />, visible: hasCode('numbering.manage') },
    { id: 'roles', label: 'Roles & Permissions', icon: <Shield size={15} />, visible: true },
  ];
  const visible = tabs.filter(t => t.visible);
  const [tab, setTab] = useState<Tab>(visible[0]?.id ?? 'roles');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Company profile, alert thresholds, tax configuration, document numbering, and roles</p>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-fit max-w-full overflow-x-auto">
        {visible.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 md:px-4 min-h-[40px] md:min-h-0 py-2 md:py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === t.id && <TabPill group="settings" />}
            <span className="relative flex items-center gap-1.5">{t.icon}{t.label}</span>
          </button>
        ))}
      </div>

      <TabPanel k={tab}>
        {tab === 'company' && <CompanyTab />}
        {tab === 'tax' && <TaxTab />}
        {tab === 'numbering' && <NumberingTab />}
        {tab === 'roles' && <RolesTab canEdit={hasCode('identity.role.manage')} />}
      </TabPanel>
    </div>
  );
}
