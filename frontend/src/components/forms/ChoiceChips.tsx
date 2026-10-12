interface ChoiceChipsProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  /** Accessible name for the group when there is no visible label. */
  ariaLabel?: string;
}

/**
 * A row of large tap targets for a short fixed choice (status, charge basis, payment mode…) -
 * used instead of a dropdown, which is fiddly on a phone. Keep it to about six options.
 */
export function ChoiceChips<T extends string>({ value, options, onChange, label, disabled, className = '', ariaLabel }: ChoiceChipsProps<T>) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
      {label && <span className="text-sm font-medium">{label}</span>}
      <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
        {options.map(o => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`pressable min-h-10 px-3.5 rounded-lg border text-sm font-medium transition-colors disabled:opacity-60 ${
                active
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-surface,white)] border-[var(--color-border)] text-slate-700 hover:border-[#B80037]'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
