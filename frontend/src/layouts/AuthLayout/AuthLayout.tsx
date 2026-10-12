import { Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useReducedMotionSafe } from '../../components/motion';
import { LogoFull } from '../../components/brand/Logo';
import { BRAND } from '../../config/brand';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** The company logo (signature + "Since 1991 · We Care What You Wear"), scaling in on load. */
function BrandMark() {
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.1 }}
    >
      <LogoFull width={230} />
    </motion.div>
  );
}

export function AuthLayout() {
  const reduce = useReducedMotionSafe();

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center gap-6 py-8 px-4 overflow-hidden bg-[#1E0A11]">
      {/* Backdrop: indigo glows (cheap radial gradients, slowly drifting) over a faint woven texture. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <motion.div
          className="absolute -top-1/3 -left-1/3 w-[120vmax] h-[120vmax] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgb(228 0 67 / 0.38), transparent 70%)' }}
          animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-1/2 -right-1/3 w-[100vmax] h-[100vmax] rounded-full"
          style={{ background: 'radial-gradient(closest-side, rgb(252 211 77 / 0.14), transparent 70%)' }}
          animate={reduce ? undefined : { x: [0, -30, 0], y: [0, -40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, #fff 0 1px, transparent 1px 9px), repeating-linear-gradient(-45deg, #fff 0 1px, transparent 1px 9px)',
            maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 75%)',
          }}
        />
      </div>

      <motion.div
        className="relative w-full max-w-sm bg-white rounded-[1.25rem] shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.06)] p-6 sm:p-8"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <div className="flex flex-col items-center mb-6 sm:mb-7">
          <BrandMark />
          <motion.h1
            className="mt-3 text-xl font-bold tracking-tight text-slate-900 text-center"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.25, ease: EASE }}
          >
            {BRAND.name}
          </motion.h1>
          <motion.p
            className="text-slate-500 text-sm mt-1"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.32, ease: EASE }}
          >
            Sign in to your account
          </motion.p>
        </div>
        <Outlet />
      </motion.div>

      <motion.p
        className="relative text-xs text-white/45 text-center max-w-xs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.6 }}
      >
        © {new Date().getFullYear()} {BRAND.name}
      </motion.p>
    </div>
  );
}
