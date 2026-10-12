import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? `input-${autoId}`;

    return (
      <div className="flex flex-col gap-1 min-w-0">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700 transition-colors">
            {label}
            {props.required && <span className="text-red-500 ml-0.5">*</span>}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={[
            'w-full min-w-0 px-3 py-2.5 md:py-2 text-base md:text-sm border rounded-lg bg-white text-slate-900',
            'placeholder:text-slate-400 transition-[border-color,box-shadow,background-color] duration-150',
            'hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-[#E40043]/15 focus:border-[#E40043]',
            'disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed',
            error
              ? 'border-red-400 hover:border-red-400 focus:ring-red-500/15 focus:border-red-500'
              : 'border-slate-200',
            className,
          ].join(' ')}
          {...props}
        />
        {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
        {error && <span key={error} className="text-xs text-red-500 animate-fade-in" role="alert">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
