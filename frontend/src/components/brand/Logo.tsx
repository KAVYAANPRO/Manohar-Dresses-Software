import { BRAND } from '../../config/brand';

/** Company logo artwork (vector, from the company's logo PDF) served from public/brand/. */
export const LOGO_MARK_WHITE = '/brand/mark-white.svg';
export const LOGO_FULL_COLOR = '/brand/logo-color.svg';
export const LOGO_FULL_WHITE = '/brand/logo-white.svg';

interface LogoMarkProps {
  /** Tile size in px. */
  size?: number;
  className?: string;
}

/** The company signature, white on the brand red tile - used wherever the app shows its icon. */
export function LogoMark({ size = 32, className = '' }: LogoMarkProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center shadow-[0_4px_12px_-3px_rgb(228_0_67/0.5)] ${className}`}
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), background: BRAND.color }}
      aria-hidden="true"
    >
      <img src={LOGO_MARK_WHITE} alt="" draggable={false} style={{ width: Math.round(size * 0.86), height: 'auto' }} />
    </span>
  );
}

interface LogoProps extends LogoMarkProps {
  /** Hide the name (icon only). */
  compact?: boolean;
  /** Light text for dark backgrounds (sidebar). */
  onDark?: boolean;
  textClassName?: string;
}

/** Mark + company name. */
export function Logo({ size = 32, compact = false, onDark = false, className = '', textClassName = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
      <LogoMark size={size} />
      {!compact && (
        <span className={`font-bold tracking-tight truncate ${onDark ? 'text-white' : 'text-slate-900'} ${textClassName}`}>
          {BRAND.name}
        </span>
      )}
    </span>
  );
}

/** The full logo with tagline (login screen, print headers). `variant="white"` for dark backgrounds. */
export function LogoFull({ variant = 'color', className = '', width = 220 }: { variant?: 'color' | 'white'; className?: string; width?: number }) {
  return (
    <img
      src={variant === 'white' ? LOGO_FULL_WHITE : LOGO_FULL_COLOR}
      alt={BRAND.name}
      draggable={false}
      className={className}
      style={{ width, maxWidth: '100%', height: 'auto' }}
    />
  );
}
