import type { HTMLAttributes } from 'react';

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Tailwind sizing, e.g. "h-4 w-1/2". */
  className?: string;
  /** Fully round (avatars, icon chips). */
  circle?: boolean;
}

/**
 * Loading placeholder with a soft moving sheen (see `.skeleton` in index.css).
 * Reserve the real content's size so nothing jumps when data arrives.
 * @example <Skeleton className="h-4 w-1/2" />
 */
export function Skeleton({ className = '', circle = false, ...props }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton ${circle ? '!rounded-full' : ''} ${className}`} {...props} />;
}

/** A few stacked text lines, last one shorter. */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}
