import type { Transition, Variants } from 'framer-motion';

/**
 * Shared motion tokens. Every primitive in this folder reads from here so the whole app moves
 * with one rhythm. Mirrors the CSS tokens in index.css (--ease-out-soft, --duration-*).
 *
 * Rules of thumb (phones first): animate only transform/opacity, keep it 150-350ms,
 * springs only for things the finger directly moves (drawers, pills, indicators).
 */
export type Bezier = [number, number, number, number];

export const easing = {
  /** Fast start, long gentle settle. Default for entrances. */
  out: [0.22, 1, 0.36, 1] as Bezier,
  /** Symmetric, for things that move from A to B on screen. */
  inOut: [0.65, 0, 0.35, 1] as Bezier,
  /** Quick exit, gets out of the way. */
  in: [0.4, 0, 1, 1] as Bezier,
};

/** Seconds (framer-motion units). */
export const duration = {
  fast: 0.15,
  base: 0.22,
  slow: 0.32,
};

export const spring: Record<'snappy' | 'soft' | 'drawer', Transition> = {
  /** Active indicators, tab pills, tap feedback. */
  snappy: { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 },
  /** Larger surfaces that should settle gently. */
  soft: { type: 'spring', stiffness: 320, damping: 32 },
  /** Side drawers / sheets: no visible overshoot. */
  drawer: { type: 'spring', stiffness: 420, damping: 42, mass: 0.9 },
};

/** Variants used by <StaggerItem>; exported so custom elements (motion.li, motion.tr) can reuse them. */
export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easing.out } },
};

/** Spread onto any motion element for consistent tap feedback: <motion.div {...tapScale} />. */
export const tapScale = {
  whileTap: { scale: 0.97 },
  transition: { duration: duration.fast, ease: easing.out },
} as const;
