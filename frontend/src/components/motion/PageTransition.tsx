import type { ReactNode, RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import { duration, easing } from './tokens';

const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easing.out } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.12, ease: easing.in } },
};

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fade + small upward slide for a whole page. Used by <AnimatedOutlet>; can also wrap any
 * view that swaps in place (e.g. a tab body keyed on the active tab inside AnimatePresence).
 * The transform resolves to `none` when the entrance finishes, so `position: fixed`
 * dialogs inside the page are unaffected afterwards.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="enter" exit="exit" className={className}>
      {children}
    </motion.div>
  );
}

interface AnimatedOutletProps {
  className?: string;
  /** Scroll container to reset to the top once the old page has left. */
  scrollRef?: RefObject<HTMLElement | null>;
  /** Layouts that scroll the window instead of an inner element: scroll the window to the top between pages. */
  resetWindowScroll?: boolean;
}

/**
 * Drop-in replacement for react-router's <Outlet /> that cross-fades between routes,
 * keyed on the pathname. `useOutlet()` freezes the leaving page's element so it keeps
 * rendering its own content while it fades out.
 */
export function AnimatedOutlet({ className, scrollRef, resetWindowScroll = false }: AnimatedOutletProps) {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence
      mode="wait"
      onExitComplete={() => {
        if (scrollRef?.current) scrollRef.current.scrollTop = 0;
        if (resetWindowScroll) window.scrollTo(0, 0);
      }}
    >
      <PageTransition key={location.pathname} className={className}>
        {outlet}
      </PageTransition>
    </AnimatePresence>
  );
}
