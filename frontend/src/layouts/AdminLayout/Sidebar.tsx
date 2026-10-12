import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { Collapse } from '../../components/motion';
import { NavLink } from 'react-router-dom';
import { Menu, ChevronLeft, ChevronDown, X } from 'lucide-react';
import { usePermission } from '../../lib/permissions/usePermission';
import { LogoMark } from '../../components/brand/Logo';
import { BRAND } from '../../config/brand';
import type { PermissionKey } from '../../lib/permissions/permissions';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

interface NavItem { path: string; label: string; permission?: PermissionKey }
interface NavGroup { label: string; items: NavItem[] }

// Every item below carries the permission that actually governs it (see permissions.ts) — a
// department only ever sees the sections it holds a view permission for; nothing is shown "by
// default". The route itself is guarded too (RequirePermission / page-level Can), so this isn't
// just cosmetic — typing the URL directly is blocked the same way.
const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ path: '/', label: 'Dashboard' }],
  },
  {
    label: 'Sales & Delivery',
    items: [
      { path: '/sales/orders', label: 'Sales Orders', permission: 'salesorders.view' },
      { path: '/sales/exhibition-orders', label: 'Exhibition Orders', permission: 'salesorders.view' },
      { path: '/sales/delivery-challans', label: 'Delivery Challans', permission: 'salesorders.view' },
      { path: '/sales/invoices', label: 'Invoices', permission: 'invoices.view' },
      { path: '/sales/returns', label: 'Sales Returns', permission: 'salesorders.view' },
      { path: '/sales/payments', label: 'Payments', permission: 'payments.view' },
    ],
  },
  {
    label: 'Purchase',
    items: [
      { path: '/procurement/purchases', label: 'Purchase Orders', permission: 'purchases.view' },
      { path: '/procurement/inward', label: 'Purchase Inward', permission: 'inward.view' },
      { path: '/procurement/returns', label: 'Purchase Returns', permission: 'purchases.view' },
    ],
  },
  {
    label: 'Production',
    items: [
      { path: '/production/designs', label: 'Design Recipe (BOM)', permission: 'designs.view' },
      { path: '/production/requirements', label: 'Prod. Requirements', permission: 'requirements.view' },
      { path: '/production/job-slips', label: 'Job Slips', permission: 'jobslips.view' },
      { path: '/production/processing', label: 'Processing Jobs', permission: 'processing.view' },
      { path: '/production/issuance', label: 'Material Issuance', permission: 'issuance.view' },
      { path: '/production/receiving', label: 'Receiving', permission: 'receiving.view' },
      { path: '/production/khata-book', label: 'Karigar Khata Book', permission: 'jobslips.view' },
    ],
  },
  {
    label: 'Stock',
    items: [
      { path: '/inventory/stock', label: 'Stock Overview', permission: 'stock.view' },
      { path: '/inventory/ledger', label: 'Stock Ledger', permission: 'stock.view' },
      { path: '/inventory/lots', label: 'Lots', permission: 'stock.view' },
      { path: '/inventory/adjustments', label: 'Adjustments', permission: 'stock.view' },
      { path: '/inventory/materials', label: 'Materials', permission: 'materials.view' },
      { path: '/ready-stock', label: 'Ready Stock', permission: 'readystock.view' },
      { path: '/ready-stock/packing', label: 'Packing', permission: 'packing.view' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { path: '/catalog', label: 'Design Catalog', permission: 'designs.view' },
    ],
  },
  {
    label: 'Costing',
    items: [
      { path: '/costing', label: 'Cost Sheets', permission: 'costing.view' },
    ],
  },
  {
    label: 'Reports & Traceability',
    items: [
      { path: '/reports', label: 'Reports', permission: 'reports.view' },
      { path: '/traceability', label: 'Traceability', permission: 'traceability.view' },
    ],
  },
  {
    label: 'Masters',
    items: [
      { path: '/production/karigars', label: 'Karigars', permission: 'factories.view' },
      { path: '/masters/customers', label: 'Customers', permission: 'customers.view' },
      { path: '/admin/users', label: 'Team Members', permission: 'users.manage' },
      { path: '/procurement/suppliers', label: 'Suppliers', permission: 'suppliers.view' },
      { path: '/masters/agents', label: 'Agents', permission: 'customers.view' },
      { path: '/masters/locations', label: 'Office / Godowns', permission: 'stock.view' },
      { path: '/masters/factories', label: 'Factories / Artisans', permission: 'factories.view' },
      { path: '/masters/categories', label: 'Categories', permission: 'materials.view' },
      { path: '/masters/colours', label: 'Colours', permission: 'materials.view' },
      { path: '/masters/sizes', label: 'Sizes', permission: 'designs.view' },
      { path: '/masters/units', label: 'Units', permission: 'materials.view' },
      { path: '/masters/processes', label: 'Processing Types', permission: 'materials.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { path: '/audit-log', label: 'Audit Log', permission: 'auditlog.view' },
      { path: '/settings', label: 'Settings', permission: 'settings.manage' },
    ],
  },
];

export function Sidebar({ mobileOpen, setMobileOpen, collapsed, setCollapsed }: SidebarProps) {
  const { has } = usePermission();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(navGroups.map(g => g.label))
  );

  const visibleGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => !item.permission || has(item.permission)) }))
    .filter(group => group.items.length > 0);

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // Escape closes the phone drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, setMobileOpen]);

  const bodyProps = { visibleGroups, expandedGroups, toggleGroup };

  return (
    <>
      {/* Desktop: static column; collapsing just narrows it to compact text (no icon rail). */}
      <aside
        className={[
          collapsed ? 'w-[176px]' : 'w-[260px]',
          'hidden lg:flex bg-[#1E0A11] text-slate-100 flex-col shrink-0 overflow-hidden',
          'transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        ].join(' ')}
      >
        <SidebarHeader collapsed={collapsed}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex shrink-0 items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors pressable"
            aria-label="Toggle sidebar"
          >
            <motion.span
              key={collapsed ? 'menu' : 'chev'}
              initial={{ opacity: 0, rotate: collapsed ? -90 : 90 }}
              animate={{ opacity: 1, rotate: 0 }}
              transition={{ duration: 0.2 }}
              className="flex"
            >
              {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
            </motion.span>
          </button>
        </SidebarHeader>
        <SidebarNav id="desktop" {...bodyProps} onNavigate={() => undefined} />
      </aside>

      {/* Phone / tablet: spring drawer + fading backdrop, swipe left to close. */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              className="fixed inset-0 bg-slate-950/55 z-20 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              key="sidebar-drawer"
              className="w-[260px] max-w-[85vw] h-dvh bg-[#1E0A11] text-slate-100 flex flex-col fixed inset-y-0 left-0 z-30 lg:hidden shadow-[8px_0_32px_-8px_rgb(0_0_0/0.5)]"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 420, damping: 42, mass: 0.9 }}
              drag="x"
              dragDirectionLock
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.9, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -70 || info.velocity.x < -450) setMobileOpen(false);
              }}
              role="dialog"
              aria-modal="true"
              aria-label="Main menu"
            >
              <SidebarHeader collapsed={false}>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="flex shrink-0 items-center justify-center w-10 h-10 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors ml-auto pressable"
                  aria-label="Close menu"
                >
                  <X size={18} />
                </button>
              </SidebarHeader>
              <SidebarNav id="mobile" {...bodyProps} onNavigate={() => setMobileOpen(false)} stagger />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarHeader({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 h-16 border-b border-white/10 shrink-0">
      <span className="flex items-center gap-2.5 min-w-0">
        <LogoMark size={32} />
        <span className="font-bold text-base truncate bg-gradient-to-r from-white to-[#FCD58A] bg-clip-text text-transparent">
          {collapsed ? BRAND.shortName : BRAND.name}
        </span>
      </span>
      {children}
    </div>
  );
}

interface SidebarNavProps {
  /** Distinct per instance so the desktop and phone indicators never animate into each other. */
  id: string;
  visibleGroups: NavGroup[];
  expandedGroups: Set<string>;
  toggleGroup: (label: string) => void;
  onNavigate: () => void;
  stagger?: boolean;
}

function SidebarNav({ id, visibleGroups, expandedGroups, toggleGroup, onNavigate, stagger = false }: SidebarNavProps) {
  return (
    <LayoutGroup id={`sidebar-${id}`}>
      <motion.nav
        layoutScroll
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 scrollbar-thin"
        initial={stagger ? 'hidden' : false}
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.025, delayChildren: 0.08 } } }}
      >
        {visibleGroups.map(group => {
          const open = expandedGroups.has(group.label);
          return (
            <motion.div
              key={group.label}
              variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } } }}
            >
              <button
                onClick={() => toggleGroup(group.label)}
                aria-expanded={open}
                className="flex items-center justify-between w-full px-4 py-2.5 lg:py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#FF6F94]/60 hover:text-[#FFB8CA] transition-colors mt-2"
              >
                <span className="truncate">{group.label}</span>
                <ChevronDown
                  size={12}
                  className="transition-transform duration-200 shrink-0"
                  style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                />
              </button>

              <Collapse open={open}>
                <div className="px-2 pb-1">
                  {group.items.map(item => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === '/'}
                      onClick={() => { if (window.innerWidth < 1024) onNavigate(); }}
                      className={({ isActive }) =>
                        [
                          'relative flex items-center px-3 py-3 lg:py-2 min-h-11 lg:min-h-0 rounded-lg text-sm transition-colors pressable',
                          isActive ? 'text-white font-medium' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                        ].join(' ')
                      }
                      title={item.label}
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <motion.span
                              layoutId={`sidebar-active-${id}`}
                              className="absolute inset-0 rounded-lg bg-white/[0.09] ring-1 ring-inset ring-white/[0.06]"
                              transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }}
                            >
                              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-[#F59E0B] shadow-[0_0_10px_rgb(39_237_247/0.7)]" />
                            </motion.span>
                          )}
                          <span className="relative truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </Collapse>
            </motion.div>
          );
        })}
      </motion.nav>
    </LayoutGroup>
  );
}
