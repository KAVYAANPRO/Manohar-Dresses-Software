import { useState } from 'react';
import type { ReactNode } from 'react';
import { PickerField, PickerSheet, type PickerItem } from './PickerSheet';

interface UnitPickerFieldProps {
  uoms: { _id: string; code: string; name: string }[];
  value: string;
  onChange: (uomId: string) => void;
  label?: ReactNode;
  /** Text of the "no unit chosen" option, e.g. "Base unit". Omit to make a unit required. */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  selectClassName?: string;
}

const MAX_SELECT = 8;

/**
 * Unit of measure: a plain dropdown while the list is short (8 or fewer), otherwise a
 * full-screen search page like every other record picker.
 */
export function UnitPickerField({ uoms, value, onChange, label, emptyLabel, disabled, className = '', selectClassName = 'input-field w-full' }: UnitPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const current = uoms.find(u => u._id === value);

  if (uoms.length <= MAX_SELECT) {
    return (
      <label className={`flex flex-col gap-1 min-w-0 ${className}`}>
        {label && <span className="text-sm font-medium">{label}</span>}
        <select className={selectClassName} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
          <option value="">{emptyLabel ?? 'Choose unit…'}</option>
          {uoms.map(u => <option key={u._id} value={u._id}>{u.name} ({u.code})</option>)}
        </select>
      </label>
    );
  }

  const items: PickerItem[] = [
    ...(emptyLabel ? [{ id: '', title: emptyLabel }] : []),
    ...uoms.map(u => ({ id: u._id, title: u.name, subtitle: u.code, keywords: u.code })),
  ];
  return (
    <>
      <PickerField
        className={className}
        label={label}
        value={current ? `${current.name} (${current.code})` : (emptyLabel && !value ? emptyLabel : undefined)}
        placeholder="Choose unit"
        disabled={disabled}
        onOpen={() => setOpen(true)}
      />
      <PickerSheet
        open={open}
        title="Choose unit"
        items={items}
        selectedId={value}
        searchPlaceholder="Search unit…"
        onSelect={it => { onChange(it.id); setOpen(false); }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
