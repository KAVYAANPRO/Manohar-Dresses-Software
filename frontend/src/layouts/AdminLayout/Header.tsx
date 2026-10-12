import { Menu, LogOut } from 'lucide-react';
import { AlertsBell } from './AlertsBell';
import { useAuth } from '../../lib/auth/AuthContext';
import { Logo } from '../../components/brand/Logo';
import { ROLE_LABELS } from '../../lib/permissions/permissions';

interface HeaderProps {
  toggleMobileMenu: () => void;
  /** The page below has scrolled: lift the header with a soft shadow. */
  scrolled?: boolean;
}

export function Header({ toggleMobileMenu, scrolled = false }: HeaderProps) {
  const { user, logout } = useAuth();
  const initials = user?.name?.slice(0, 2).toUpperCase() ?? 'U';

  return (
    <header
      className={[
        'relative z-10 flex items-center justify-between gap-2 px-3 sm:px-4 h-16 bg-white border-b shrink-0',
        'transition-[box-shadow,border-color] duration-200',
        scrolled ? 'border-slate-200/70 shadow-[0_6px_20px_-12px_rgb(15_23_42/0.25)]' : 'border-slate-200',
      ].join(' ')}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={toggleMobileMenu}
          className="pressable flex lg:hidden shrink-0 items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200/70 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <Logo size={28} className="lg:hidden" textClassName="text-base" />
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0 min-w-0">
        {/* Read-only — reflects the real logged-in account's role. Switching departments means
            logging in as a different account (set up by Super Admin), never a client-side toggle. */}
        {user?.role && (
          <span className="animate-fade-in hidden sm:inline-block text-xs border border-[#FFB8CA] bg-[#FFF0F3] text-[#B80037] rounded-full px-2 sm:px-2.5 py-1 font-medium max-w-[88px] sm:max-w-[180px] truncate" title={ROLE_LABELS[user.role]}>
            {ROLE_LABELS[user.role]}
          </span>
        )}

        <AlertsBell />

        <div className="flex items-center gap-1 sm:gap-2 pl-1 sm:pl-2 border-l border-slate-200 shrink-0">
          <div className="hidden min-[400px]:flex shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-[#FFDCE5] to-[#FFB8CA] text-[#B80037] ring-2 ring-white shadow-[0_1px_3px_rgb(184_0_55/0.25)] items-center justify-center text-xs font-bold select-none">
            {initials}
          </div>
          <span className="text-sm font-medium text-slate-700 hidden sm:block max-w-32 truncate">
            {user?.name ?? 'User'}
          </span>

          <button
            onClick={logout}
            className="pressable flex shrink-0 items-center justify-center w-10 h-10 rounded-lg text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
