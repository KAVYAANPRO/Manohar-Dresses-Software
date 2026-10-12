import type { ReactNode, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  action?: ReactNode;
}

export function CardHeader({ title, action, className = '', ...props }: CardHeaderProps) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 mb-4 ${className}`} {...props}>
      <h3 className="text-base md:text-lg font-semibold min-w-0 text-[var(--color-text-main)]">{title}</h3>
      {action && <div>{action}</div>}
    </div>
  );
}
