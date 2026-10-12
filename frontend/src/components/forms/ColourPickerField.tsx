import { useState } from 'react';
import type { ReactNode } from 'react';
import { PickerField, PickerSheet, type PickerItem } from './PickerSheet';

interface ColourPickerFieldProps {
  /** Colour names to offer, best first (e.g. the material's own colours, then the colour master). */
  options: string[];
  value: string;
  onChange: (colourName: string) => void;
  label?: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Colour chosen on a full-screen search page. A colour that isn't listed yet can be added right
 * there - it is saved by name and the server adds it to the colour master.
 */
export function ColourPickerField({ options, value, onChange, label, placeholder = 'Tap to choose colour', disabled, className = '' }: ColourPickerFieldProps) {
  const [open, setOpen] = useState(false);
  const items: PickerItem[] = Array.from(new Set(options.filter(Boolean))).map(n => ({ id: n, title: n }));
  return (
    <>
      <PickerField className={className} label={label} value={value || undefined} placeholder={placeholder} disabled={disabled} onOpen={() => setOpen(true)} />
      <PickerSheet
        open={open}
        title="Choose colour"
        items={items}
        selectedId={value}
        searchPlaceholder="Search or type a new colour…"
        emptyText="No such colour yet."
        onSelect={it => { onChange(it.id); setOpen(false); }}
        onClose={() => setOpen(false)}
        createLabel="colour"
        onCreate={q => { if (q.trim()) { onChange(q.trim().replace(/\s+/g, ' ')); setOpen(false); } }}
      />
    </>
  );
}
