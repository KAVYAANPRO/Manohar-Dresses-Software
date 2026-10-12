import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { readyStockApi, customersRefApi, pricingApi, apiErrorMessage, customerLabel, type SellableItem, type CustomerRef, type LineInput, type PricePreview, type AgentRecord } from '../../lib/api/sales';
import { PickerField, PickerSheet, type PickerItem } from '../../components/forms/PickerSheet';
import { QuickAddCustomerSheet } from '../../components/forms/QuickAddCustomerSheet';
import { QuickAddAgentSheet } from '../../components/forms/QuickAddAgentSheet';
import { QuickAddDesignSheet } from '../../components/forms/QuickAddDesignSheet';

/** Loads every sellable variant (with on-hand / reserved / ATP) once per page. */
export function useSellableItems() {
  const [items, setItems] = useState<SellableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reload = () => {
    setLoading(true);
    return readyStockApi
      .items()
      .then(list => { setItems(list); return list; })
      .catch(e => { setError(apiErrorMessage(e, 'Could not load products.')); return [] as SellableItem[]; })
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);
  return { items, loading, error, reload };
}

export function useCustomers() {
  const [customers, setCustomers] = useState<CustomerRef[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    customersRefApi
      .list()
      .then(cs => setCustomers(cs.filter(c => c.isActive !== false)))
      .catch(e => setError(apiErrorMessage(e, 'Could not load customers.')))
      .finally(() => setLoaded(true));
  }, []);
  /** Put a customer created from a picker into the list straight away. */
  const add = (c: CustomerRef) => setCustomers(prev => (prev.some(x => x._id === c._id) ? prev : [...prev, c]));
  return { customers, error, loaded, add };
}

/** Shown after a create was saved on the device because there is no internet. */
export function notifySavedOffline(what: string) {
  window.alert(`No internet — ${what} is saved on this phone and will be sent automatically when you are back online.`);
}

const noneId = '__none__';

/** Customer chosen on a full-screen search page, with "+ Add customer" right there. */
export function CustomerPickerField({
  customers, value, onChange, onAdded, label = 'Customer', placeholder = 'Tap to choose customer', noneLabel, disabled, className,
}: {
  customers: CustomerRef[];
  value: string;
  onChange: (customer: CustomerRef | null) => void;
  /** Called with a customer created from the picker (add it to the list). */
  onAdded?: (customer: CustomerRef) => void;
  label?: ReactNode;
  placeholder?: string;
  /** Offer a "none" row (e.g. "Find by mobile or create"). */
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [addName, setAddName] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = customers.find(c => c._id === value);
  const items = useMemo<PickerItem[]>(() => [
    ...(noneLabel ? [{ id: noneId, title: noneLabel }] : []),
    ...customers.map(c => ({
      id: c._id,
      title: customerLabel(c),
      subtitle: [c.businessName && c.businessName !== c.name ? c.name : '', c.mobile, c.gstin, c.state].filter(Boolean).join(' · '),
      keywords: `${c.name} ${c.mobile ?? ''} ${c.gstin ?? ''}`,
    })),
  ], [customers, noneLabel]);
  return (
    <>
      <PickerField
        className={className}
        label={label}
        value={current ? customerLabel(current) : undefined}
        hint={current ? [current.mobile, current.gstin, current.state].filter(Boolean).join(' · ') : undefined}
        placeholder={!value && noneLabel ? noneLabel : placeholder}
        disabled={disabled}
        onOpen={() => setOpen(true)}
      />
      <PickerSheet
        open={open}
        title="Choose customer"
        items={items}
        selectedId={value || (noneLabel ? noneId : undefined)}
        onSelect={it => { onChange(it.id === noneId ? null : customers.find(c => c._id === it.id) ?? null); setOpen(false); }}
        onClose={close}
        searchPlaceholder="Name, shop, mobile or GSTIN…"
        emptyText="No customer matches."
        onCreate={q => { setOpen(false); setAddName(q); }}
        createLabel="customer"
      />
      <QuickAddCustomerSheet
        open={addName !== null}
        initialName={addName ?? ''}
        onClose={() => setAddName(null)}
        onCreated={c => {
          const ref = { ...c, isActive: c.isActive !== false } as CustomerRef;
          setAddName(null);
          onAdded?.(ref);
          onChange(ref);
        }}
      />
    </>
  );
}

/** Sales agent chosen on a full-screen search page, with "+ Add agent" right there. */
export function AgentPickerField({
  agents, value, onChange, onAdded, label = 'Agent', noneLabel = 'No agent', disabled, className,
}: {
  agents: AgentRecord[];
  value: string;
  onChange: (agent: AgentRecord | null) => void;
  onAdded?: (agent: AgentRecord) => void;
  label?: ReactNode;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [addName, setAddName] = useState<string | null>(null);
  const close = useCallback(() => setOpen(false), []);
  const current = agents.find(a => a._id === value);
  const items = useMemo<PickerItem[]>(() => [
    { id: noneId, title: noneLabel },
    ...agents.map(a => ({
      id: a._id,
      title: a.name,
      subtitle: [a.agencyName, a.mobile, a.city].filter(Boolean).join(' · '),
      meta: a.commissionPct ? `${a.commissionPct}%` : undefined,
      badge: a.isActive ? undefined : 'Inactive',
      keywords: a.mobile,
    })),
  ], [agents, noneLabel]);
  return (
    <>
      <PickerField
        className={className}
        label={label}
        value={current ? `${current.name}${current.commissionPct ? ` (${current.commissionPct}%)` : ''}` : noneLabel}
        hint={current ? [current.agencyName, current.mobile].filter(Boolean).join(' · ') : undefined}
        disabled={disabled}
        onOpen={() => setOpen(true)}
      />
      <PickerSheet
        open={open}
        title="Choose agent"
        items={items}
        selectedId={value || noneId}
        onSelect={it => { onChange(it.id === noneId ? null : agents.find(a => a._id === it.id) ?? null); setOpen(false); }}
        onClose={close}
        searchPlaceholder="Agent name, agency or mobile…"
        emptyText="No agent matches."
        onCreate={q => { setOpen(false); setAddName(q); }}
        createLabel="agent"
      />
      <QuickAddAgentSheet
        open={addName !== null}
        initialName={addName ?? ''}
        onClose={() => setAddName(null)}
        onCreated={a => { setAddName(null); onAdded?.(a); onChange(a); }}
      />
    </>
  );
}

/** Indian state / UT chosen on a search page (36 names are far too many for a dropdown on a phone). */
export function StatePickerField({
  value, onChange, label = 'State', placeholder = 'Tap to choose state', noneLabel, disabled, className,
}: {
  value: string;
  onChange: (state: string) => void;
  label?: ReactNode;
  placeholder?: string;
  noneLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const items = useMemo<PickerItem[]>(() => [
    ...(noneLabel ? [{ id: noneId, title: noneLabel }] : []),
    ...INDIAN_STATES.map(s => ({ id: s, title: s, keywords: Object.entries(GST_STATE_CODES).find(([, n]) => n === s)?.[0] })),
  ], [noneLabel]);
  return (
    <>
      <PickerField className={className} label={label} value={value || noneLabel} placeholder={placeholder} disabled={disabled} onOpen={() => setOpen(true)} />
      <PickerSheet
        open={open}
        title="Choose state"
        items={items}
        selectedId={value || (noneLabel ? noneId : undefined)}
        onSelect={it => { onChange(it.id === noneId ? '' : it.id); setOpen(false); }}
        onClose={close}
        searchPlaceholder="State name or GST code…"
      />
    </>
  );
}

export function ErrorBanner({ message, onClose }: { message: string; onClose?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-800">
      <AlertTriangle size={15} className="text-red-500 mt-0.5 shrink-0" />
      <span className="flex-1 break-words">{message}</span>
      {onClose && <button onClick={onClose} className="text-red-500 text-xs font-medium">Dismiss</button>}
    </div>
  );
}

export function Spinner() {
  return <div className="flex justify-center p-12"><div className="w-8 h-8 border-2 border-[#E40043] border-t-transparent rounded-full animate-spin" /></div>;
}

/**
 * Product (design / colour / size) chosen on one full-screen search page: type any mix of design
 * no., name, colour and size ("102 red m"). "+ Add design" creates a design right there; its
 * colour & size variants are then listed so one can be picked. Calls onChange with the variant.
 */
export function VariantPicker({
  items,
  value,
  onChange,
  compact,
  onReload,
}: {
  items: SellableItem[];
  value: string;
  onChange: (item: SellableItem | null) => void;
  compact?: boolean;
  /** Reloads the sellable list (enables "+ Add design" from the picker). */
  onReload?: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [designFilter, setDesignFilter] = useState<string | null>(null);
  const [addName, setAddName] = useState<string | null>(null);
  const close = useCallback(() => { setOpen(false); setDesignFilter(null); }, []);
  const current = items.find(i => i.designVariantId === value);

  const list = designFilter ? items.filter(i => i.designId === designFilter) : items;
  const pickerItems = useMemo<PickerItem[]>(() => list.map(i => ({
    id: i.designVariantId,
    title: `${i.designNo ?? '?'} · ${i.colourName ?? '?'} · ${i.sizeName ?? '?'}`,
    subtitle: [i.categoryName, `on hand ${i.onHand}`].filter(Boolean).join(' · '),
    meta: `ATP ${i.atp}`,
    keywords: `${i.hsn ?? ''}`,
  })), [list]);
  const filteredDesign = designFilter ? items.find(i => i.designId === designFilter) : undefined;

  return (
    <>
      <PickerField
        className={compact ? 'min-w-[220px]' : ''}
        value={current ? `${current.designNo} · ${current.colourName} · ${current.sizeName}` : undefined}
        hint={current ? `ATP ${current.atp}` : undefined}
        placeholder="Tap to choose design / colour / size"
        onOpen={() => setOpen(true)}
      />
      <PickerSheet
        open={open}
        title={filteredDesign ? `Choose colour & size — ${filteredDesign.designNo}` : 'Choose product'}
        items={pickerItems}
        selectedId={value}
        onSelect={it => { onChange(items.find(i => i.designVariantId === it.id) ?? null); close(); }}
        onClose={close}
        searchPlaceholder="Design no., name, colour, size…"
        emptyText={designFilter ? 'This design has no colour / size variants yet.' : 'No product matches.'}
        footer={designFilter ? (
          <button type="button" onClick={() => setDesignFilter(null)} className="pressable w-full min-h-11 rounded-lg border border-[var(--color-border)] text-slate-700 font-semibold text-sm">Show all designs</button>
        ) : undefined}
        onCreate={onReload ? q => { close(); setAddName(q); } : undefined}
        createLabel="design"
      />
      {onReload && (
        <QuickAddDesignSheet
          open={addName !== null}
          initialName={addName ?? ''}
          onClose={() => setAddName(null)}
          onCreated={async d => {
            setAddName(null);
            await onReload();
            setDesignFilter(d._id);
            setOpen(true);
          }}
        />
      )}
    </>
  );
}

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir',
  'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** GSTIN state code (first two digits) -> state name. */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/**
 * Debounced server-side pricing (GST split, round-off) for unsaved lines: the frontend never
 * hard-codes tax rates (frontend.md §35). Lines without a variant or qty are skipped; the
 * returned preview's `lines` align with `previewIndex` (index into the input array).
 */
export function usePricePreview(customerId: string, lines: LineInput[], otherCharges = 0) {
  const [preview, setPreview] = useState<PricePreview | null>(null);
  const [error, setError] = useState('');
  const valid = lines.map((l, i) => ({ l, i })).filter(x => x.l.designVariantId && x.l.qty > 0);
  const key = JSON.stringify([customerId, valid.map(x => x.l), otherCharges]);
  useEffect(() => {
    if (!customerId || valid.length === 0) { setPreview(null); setError(''); return; }
    const t = setTimeout(() => {
      pricingApi.preview({ customerId, lines: valid.map(x => x.l), otherCharges })
        .then(p => { setPreview(p); setError(''); })
        .catch(e => { setPreview(null); setError(apiErrorMessage(e, 'Could not price these lines.')); });
    }, 350);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const lineAt = (index: number) => {
    const pos = valid.findIndex(x => x.i === index);
    return pos >= 0 ? preview?.lines[pos] : undefined;
  };
  return { preview, error, lineAt };
}
