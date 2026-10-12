import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, animate, motion, useInView } from 'framer-motion';
import type { HTMLMotionProps, Variants } from 'framer-motion';
import { duration, easing, staggerItemVariants, tapScale } from './tokens';
import { useReducedMotionSafe } from './useReducedMotionSafe';

/* ------------------------------------------------------------------------------------------ */

interface FadeInProps extends HTMLMotionProps<'div'> {
  /** Seconds before the entrance starts. */
  delay?: number;
  /** Start offset in px (positive = from below). 0 for a pure fade. */
  y?: number;
  /** Seconds. Defaults to the "slow" token (0.32). */
  duration?: number;
}

/**
 * Fades (and optionally slides) its content in on mount.
 * @example <FadeIn delay={0.05}><Card>…</Card></FadeIn>
 */
export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(function FadeIn(
  { delay = 0, y = 8, duration: d = duration.slow, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: d, delay, ease: easing.out }}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/* ------------------------------------------------------------------------------------------ */

interface StaggerProps extends HTMLMotionProps<'div'> {
  /** Seconds between children. Keep small (0.03-0.06) so long lists don't drag. */
  stagger?: number;
  /** Seconds before the first child. */
  delay?: number;
}

/**
 * Container that reveals its <StaggerItem> children one after another on mount.
 * Only the first ~12 items visibly stagger (later ones would wait too long), so it is
 * safe on long lists. For custom elements use `variants={staggerItemVariants}`.
 * @example
 * <Stagger className="grid gap-3">
 *   {kpis.map(k => <StaggerItem key={k.id}><KPICard {...k} /></StaggerItem>)}
 * </Stagger>
 */
export const Stagger = forwardRef<HTMLDivElement, StaggerProps>(function Stagger(
  { stagger = 0.04, delay = 0, children, ...rest },
  ref,
) {
  const variants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: stagger, delayChildren: delay } },
  };
  return (
    <motion.div ref={ref} variants={variants} initial="hidden" animate="show" {...rest}>
      {children}
    </motion.div>
  );
});

/** One child of <Stagger>: fades + rises 8px. Accepts all motion div props. */
export const StaggerItem = forwardRef<HTMLDivElement, HTMLMotionProps<'div'>>(function StaggerItem(
  { children, ...rest },
  ref,
) {
  return (
    <motion.div ref={ref} variants={staggerItemVariants} {...rest}>
      {children}
    </motion.div>
  );
});

/* ------------------------------------------------------------------------------------------ */

/**
 * A <button> with tactile press feedback (scales to 0.97 while pressed).
 * For non-button elements spread `tapScale` from './tokens' onto any motion element.
 * @example <Pressable onClick={save} className="rounded-xl bg-primary px-4 py-3 text-white">Save</Pressable>
 */
export const Pressable = forwardRef<HTMLButtonElement, HTMLMotionProps<'button'>>(function Pressable(
  { children, type = 'button', ...rest },
  ref,
) {
  return (
    <motion.button ref={ref} type={type} {...tapScale} {...rest}>
      {children}
    </motion.button>
  );
});

/* ------------------------------------------------------------------------------------------ */

interface AnimatedNumberProps {
  value: number;
  /** Formats the in-between values too, e.g. `n => formatINR(n)`. Defaults to en-IN grouping, 0 decimals. */
  format?: (n: number) => string;
  /** Seconds. Count-ups read better a bit longer than UI motion (default 0.7). */
  duration?: number;
  className?: string;
  /** Start counting only when scrolled into view (default true). */
  whenInView?: boolean;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-IN');

/**
 * Counts from its previous value (0 on first mount) to `value`. Updates the DOM text
 * directly, so it never re-renders React per frame. Reduced motion: jumps straight to the value.
 * Uses `tabular-nums` so digits don't jitter while counting.
 * @example <AnimatedNumber value={totalPcs} /> · <AnimatedNumber value={amt} format={formatINR} />
 */
export function AnimatedNumber({ value, format = defaultFormat, duration: d = 0.7, className, whenInView = true }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotionSafe();
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const ready = !whenInView || inView;

  // Keep the latest formatter without restarting the animation when callers pass inline lambdas.
  const formatRef = useRef(format);
  useLayoutEffect(() => { formatRef.current = format; });

  // Safety net: never leave a placeholder 0 on screen. If the element never scrolls into view
  // (or the tab is in the background, where animation frames pause), show the real value.
  useEffect(() => {
    if (ready) return;
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (el && !inViewStarted.current) el.textContent = formatRef.current(Number.isFinite(value) ? value : 0);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [ready, value]);

  const inViewStarted = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    inViewStarted.current = true;
    const target = Number.isFinite(value) ? value : 0;
    if (reduce || from.current === target || document.visibilityState === 'hidden') {
      el.textContent = formatRef.current(target);
      from.current = target;
      return;
    }
    const controls = animate(from.current, target, {
      duration: d,
      ease: easing.out,
      onUpdate: v => { el.textContent = formatRef.current(v); },
    });
    from.current = target;
    // ...and make sure the final value lands even if frames were throttled mid-way.
    const done = window.setTimeout(() => { el.textContent = formatRef.current(target); }, d * 1000 + 400);
    return () => { controls.stop(); window.clearTimeout(done); };
  }, [value, ready, reduce, d]);

  return (
    <span ref={ref} className={['tabular-nums', className].filter(Boolean).join(' ')}>
      {format(whenInView && !reduce ? 0 : value)}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------ */

interface CollapseProps {
  open: boolean;
  children: ReactNode;
  className?: string;
  /** Animate on first mount when initially open (default false: appears instantly). */
  animateOnMount?: boolean;
}

/**
 * Animated show/hide with height auto <-> 0 plus a fade. Content is unmounted when closed.
 * Height animation is the one non-transform property we allow; keep collapsed content small
 * (nav groups, accordions, filter panels), not whole tables.
 * @example <Collapse open={showFilters}><Filters /></Collapse>
 */
export function Collapse({ open, children, className, animateOnMount = false }: CollapseProps) {
  return (
    <AnimatePresence initial={animateOnMount}>
      {open && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, transition: { height: { duration: duration.base, ease: easing.out }, opacity: { duration: duration.base, delay: 0.04 } } }}
          exit={{ height: 0, opacity: 0, transition: { height: { duration: duration.base, ease: easing.inOut }, opacity: { duration: duration.fast } } }}
          style={{ overflow: 'hidden' }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------------------------------ */

interface PopProps extends HTMLMotionProps<'span'> {
  /** Change this to replay the pop (e.g. pass the badge count). */
  popKey?: string | number;
}

/**
 * Inline element that pops in (scale 0.6 -> 1) and re-pops whenever `popKey` changes.
 * Good for counters and status badges.
 * @example <Pop popKey={unread} className="badge">{unread}</Pop>
 */
export function Pop({ popKey, children, ...rest }: PopProps) {
  return (
    <motion.span
      key={popKey}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 600, damping: 26 }}
      {...rest}
    >
      {children}
    </motion.span>
  );
}
