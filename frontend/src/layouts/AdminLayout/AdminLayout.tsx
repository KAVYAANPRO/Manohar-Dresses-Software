import { useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { OfflineBanner } from '../../components/feedback/OfflineBanner';
import { AnimatedOutlet } from '../../components/motion';

export function AdminLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-50">
      <Sidebar
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <div className="flex flex-col flex-1 min-w-0">
        <Header toggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)} scrolled={scrolled} />
        <OfflineBanner />
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto p-4 md:p-6"
          onScroll={e => {
            const next = e.currentTarget.scrollTop > 4;
            if (next !== scrolled) setScrolled(next);
          }}
        >
          {/* Route cross-fade; resets scroll to the top once the old page has left. */}
          <AnimatedOutlet scrollRef={mainRef} />
        </main>
      </div>
    </div>
  );
}
