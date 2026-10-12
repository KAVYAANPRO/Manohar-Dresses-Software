import { useEffect, useState } from 'react';
import type { Transition } from 'framer-motion';

/**
 * Shared motion vocabulary for the component library — one set of curves and durations so every
 * surface (buttons, cards, sheets, toasts) moves with the same personality.
 * Only transform/opacity are animated, durations stay in the 150–350ms band.
 */
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

export const DURATION = { fast: 0.15, base: 0.22, slow: 0.32 } as const;

/** Gentle entrance used by cards, list rows, empty states. */
export const fadeUp: Transition = { duration: DURATION.base, ease: EASE_OUT };

/** Sheet / modal spring — critically damped-ish so it settles without wobbling. */
export const SHEET_SPRING: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 };

/** Small, snappy spring for tap feedback and indicators. */
export const SNAP_SPRING: Transition = { type: 'spring', stiffness: 520, damping: 34 };

/** Stagger delay for list item `index`, capped so long lists don't take forever to appear. */
export function staggerDelay(index: number, step = 0.035, maxItems = 12): number {
  return Math.min(index, maxItems) * step;
}

/** Subscribes to a CSS media query (SSR-safe, updates live on resize/rotation). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
