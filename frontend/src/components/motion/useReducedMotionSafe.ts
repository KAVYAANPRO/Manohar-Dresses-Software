import { useReducedMotion } from 'framer-motion';

/**
 * `true` when the user asked the OS for reduced motion. Unlike framer's `useReducedMotion`
 * it never returns `null` (SSR / unknown counts as "motion allowed"), so it is safe in conditions.
 *
 * Note: the app is wrapped in `<MotionConfig reducedMotion="user">`, which already strips
 * transform animations from every motion component. Use this hook for the things MotionConfig
 * cannot reach: JS-driven animations (count-ups), infinite loops, and choosing a different
 * variant entirely.
 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}
