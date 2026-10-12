import { useEffect } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import type { PanInfo } from 'framer-motion';
import { DURATION, EASE_OUT, SHEET_SPRING, useMediaQuery } from '../ui/motionTokens';

interface ModalShellProps {
  open: boolean;
  /** Backdrop click, Escape key and swipe-down call this. Omit to make the modal non-dismissable. */
  onClose?: () => void;
  children: ReactNode;
  /** Panel classes (width, padding, radius on desktop…). The phone bottom-sheet radius is added for you. */
  className?: string;
  panelStyle?: CSSProperties;
  /** 'sheet' (default): bottom sheet on phones, centred card from md up. 'center': centred everywhere. */
  variant?: 'sheet' | 'center';
  /** Render the panel as a <form> (keeps native Enter-to-submit). */
  as?: 'div' | 'form';
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  role?: string;
  ariaLabelledBy?: string;
  zIndexClass?: string;
}

/**
 * Shared animated overlay for every dialog / sheet in the app.
 * - Backdrop fades; on phones the panel slides up from the bottom with a grab handle you can
 *   swipe down to dismiss; on desktop it scales/fades in centred.
 * - Escape closes. Exit animations play because the panel lives inside AnimatePresence.
 * Not portalled on purpose: dialogs keep their DOM position (forms, event bubbling unchanged).
 */
export function ModalShell({
  open,
  onClose,
  children,
  className = '',
  panelStyle,
  variant = 'sheet',
  as = 'div',
  onSubmit,
  role = 'dialog',
  ariaLabelledBy,
  zIndexClass = 'z-50',
}: ModalShellProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const asSheet = variant === 'sheet' && !isDesktop;
  const dragControls = useDragControls();

  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (onClose && (info.offset.y > 110 || info.velocity.y > 600)) onClose();
  };

  // Same motion API either way; typed as div so the shared props below line up.
  const Panel = (as === 'form' ? motion.form : motion.div) as typeof motion.div;

  const panelMotion = asSheet
    ? {
        initial: { y: '100%' },
        animate: { y: 0, transition: SHEET_SPRING },
        exit: { y: '100%', transition: { duration: DURATION.base, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
      }
    : {
        initial: { opacity: 0, scale: 0.96, y: 8 },
        animate: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.base, ease: EASE_OUT } },
        exit: { opacity: 0, scale: 0.97, y: 4, transition: { duration: DURATION.fast } },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-backdrop"
          className={`fixed inset-0 ${zIndexClass} flex justify-center bg-slate-950/45 ${asSheet ? 'items-end' : 'items-center p-4'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: DURATION.base } }}
          exit={{ opacity: 0, transition: { duration: DURATION.base, delay: 0.03 } }}
          onClick={onClose}
          role={role}
          aria-modal="true"
          aria-labelledby={ariaLabelledBy}
        >
          <Panel
            {...panelMotion}
            {...(as === 'form' && onSubmit ? { onSubmit: onSubmit as unknown as React.FormEventHandler<HTMLDivElement> } : {})}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            drag={asSheet && onClose ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
            style={{ ...(asSheet ? { paddingBottom: 'env(safe-area-inset-bottom)' } : null), ...panelStyle }}
            className={[
              'relative bg-white shadow-overlay max-h-[90dvh] overflow-y-auto overscroll-contain',
              asSheet ? 'w-full !max-w-none !rounded-b-none rounded-t-[1.25rem]' : '',
              className,
            ].join(' ')}
          >
            {asSheet && (
              <div
                className="flex justify-center pt-2 pb-1 -mb-1 cursor-grab active:cursor-grabbing touch-none"
                onPointerDown={e => onClose && dragControls.start(e)}
                aria-hidden="true"
              >
                <span className="h-1.5 w-10 rounded-full bg-slate-300" />
              </div>
            )}
            {children}
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
