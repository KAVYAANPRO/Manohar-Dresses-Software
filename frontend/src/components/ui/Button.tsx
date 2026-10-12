import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

const variantClasses: Record<string, string> = {
  primary: 'bg-[#E40043] text-white hover:bg-[#CB003C] active:bg-[#B80037] border-transparent shadow-[0_1px_2px_rgb(184_0_55/0.25),inset_0_1px_0_rgb(255_255_255/0.12)] hover:shadow-[0_4px_14px_-4px_rgb(228_0_67/0.55)]',
  secondary: 'bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100 border-slate-200 shadow-[0_1px_2px_rgb(15_23_42/0.05)]',
  outline: 'bg-transparent text-[#E40043] hover:bg-[#FFF0F3] active:bg-[#FFDCE5] border-[#E40043]',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200/70 border-transparent',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 border-transparent shadow-[0_1px_2px_rgb(185_28_28/0.25)] hover:shadow-[0_4px_14px_-4px_rgb(220_38_38/0.5)]',
};

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-2 md:py-1.5 text-xs min-h-9 md:min-h-0',
  md: 'px-4 py-2.5 md:py-2 text-sm min-h-10 md:min-h-0',
  lg: 'px-5 py-3 md:py-2.5 text-base min-h-11 md:min-h-0',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        'relative inline-flex items-center justify-center gap-2 font-medium rounded-lg border select-none',
        'transition-[background-color,border-color,box-shadow,transform,opacity] duration-150 ease-out',
        isLoading || disabled ? '' : 'active:scale-[0.97]',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        isLoading || disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        className,
      ].join(' ')}
      disabled={isLoading || disabled}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {/* Label stays in the layout while loading so the button never changes width. */}
      <span className={`inline-flex items-center justify-center gap-2 transition-opacity duration-150 ${isLoading ? 'opacity-0' : 'opacity-100'}`}>
        {children}
      </span>
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center animate-fade-in" aria-hidden="true">
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </span>
      )}
    </button>
  );
}
