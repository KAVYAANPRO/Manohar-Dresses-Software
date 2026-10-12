/**
 * Motion primitives — import from 'components/motion'.
 *
 *   PageTransition / AnimatedOutlet  route-level fade + slide
 *   FadeIn                           one-off entrance
 *   Stagger + StaggerItem            list / grid reveal
 *   Pressable, tapScale              tap feedback
 *   AnimatedNumber                   count-up numbers (KPIs, totals)
 *   Collapse                         animated height show/hide
 *   Pop                              badge / counter pop
 *   useReducedMotionSafe             boolean reduced-motion check
 *   easing, duration, spring         shared timing tokens
 */
export { PageTransition, AnimatedOutlet } from './PageTransition';
export { FadeIn, Stagger, StaggerItem, Pressable, AnimatedNumber, Collapse, Pop } from './primitives';
export { useReducedMotionSafe } from './useReducedMotionSafe';
export { easing, duration, spring, staggerItemVariants, tapScale } from './tokens';
export type { Bezier } from './tokens';
