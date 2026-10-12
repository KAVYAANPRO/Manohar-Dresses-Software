import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ClipboardList, LogOut, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../lib/auth/AuthContext';
import { LogoMark } from '../../components/brand/Logo';
import { BRAND } from '../../config/brand';
import { AnimatedOutlet, Collapse, spring } from '../../components/motion';

const navItems = [
  { path: '/factory', label: 'Home', icon: <LayoutDashboard size={22} />, end: true },
  { path: '/factory/jobs', label: 'My Jobs', icon: <ClipboardList size={22} /> },
];

export function FactoryLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Which tab owns the current page (job detail pages belong to "My Jobs").
  const path = location.pathname.replace(/\/+$/, '');
  const activeTab = path.startsWith('/factory/jobs') ? '/factory/jobs' : path === '/factory' ? '/factory' : '';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top nav bar — mobile-first */}
      <header
        className={`glass sticky top-0 z-20 border-b transition-[box-shadow,border-color] duration-200 ${
          scrolled ? 'border-slate-200/70 shadow-[0_6px_20px_-12px_rgb(15_23_42/0.25)]' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between px-4 h-14">
          <span className="flex items-center gap-2 min-w-0">
            <LogoMark size={28} />
            <span className="font-bold tracking-tight text-slate-900 text-base truncate">{BRAND.portalName}</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500 hidden sm:block">{user?.name}</span>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="pressable flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200/70 transition-colors"
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={menuOpen ? 'x' : 'menu'}
                  className="flex"
                  initial={{ opacity: 0, rotate: -90, scale: 0.7 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.7 }}
                  transition={{ duration: 0.15 }}
                >
                  {menuOpen ? <X size={20} /> : <Menu size={20} />}
                </motion.span>
              </AnimatePresence>
            </button>
          </div>
        </div>

        {/* Dropdown menu */}
        <Collapse open={menuOpen}>
          <div className="border-t border-slate-100 px-4 py-3 flex flex-col gap-1">
            {navItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  `pressable flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive ? 'bg-[#FFF0F3] text-[#B80037]' : 'text-slate-600 hover:bg-slate-50'
                  }`
                }
              >
                {item.icon} {item.label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="pressable flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        </Collapse>
      </header>

      {/* Bottom nav — always visible on mobile */}
      <main className="flex-1 min-w-0 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <div className="max-w-lg mx-auto px-4 py-5">
          <AnimatedOutlet resetWindowScroll />
        </div>
      </main>

      {/* Bottom tab bar: the indigo pill glides to the active tab. */}
      <nav className="glass fixed bottom-0 left-0 right-0 border-t border-slate-200/80 z-20 flex sm:hidden px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        {navItems.map(item => {
          const isActive = activeTab === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={`relative flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors ${
                isActive ? 'text-[#B80037]' : 'text-slate-400 active:text-slate-600'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="factory-tab-pill"
                  className="absolute inset-x-3 inset-y-0 rounded-xl bg-[#FFF0F3]"
                  transition={spring.snappy}
                />
              )}
              <motion.span
                className="relative flex"
                animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }}
                transition={spring.snappy}
              >
                {item.icon}
              </motion.span>
              <span className="relative">{item.label}</span>
            </NavLink>
          );
        })}
        <button
          onClick={handleLogout}
          className="pressable flex-1 flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium text-slate-400 active:text-red-500 transition-colors"
        >
          <LogOut size={22} />
          Logout
        </button>
      </nav>
    </div>
  );
}
