import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { alertsApi, apiErrorMessage, timeAgo, type AlertItem } from '../../lib/api/insights';

const DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-slate-400',
};

const POLL_MS = 120_000;

/** ALT-01 in-app alerts: unread count on the bell, list in a dropdown (full-width sheet on phones). */
export function AlertsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    setIsLoading(true);
    alertsApi.list()
      .then(res => { setItems(res.items); setUnread(res.unreadCount); setError(''); })
      .catch(err => setError(apiErrorMessage(err, 'Could not load alerts.')))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const openAlert = async (a: AlertItem) => {
    if (!a.read) {
      setItems(prev => prev.map(x => (x.key === a.key ? { ...x, read: true } : x)));
      setUnread(u => Math.max(0, u - 1));
      alertsApi.markRead([a.key]).catch(() => undefined);
    }
    setOpen(false);
    if (a.link) navigate(a.link);
  };

  const markAll = async () => {
    try {
      await alertsApi.markAllRead();
      setItems(prev => prev.map(x => ({ ...x, read: true })));
      setUnread(0);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not mark alerts as read.'));
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        className={`pressable relative flex shrink-0 items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:bg-slate-100 active:bg-slate-200/70 transition-colors ${open ? 'bg-slate-100 text-slate-700' : ''}`}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span key={unread} className="animate-pop absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.14 } }}
          style={{ transformOrigin: 'top right' }}
          className="fixed inset-x-2 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96 z-40 bg-white border border-slate-200/80 rounded-xl shadow-overlay flex flex-col max-h-[75vh] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Alerts {items.length > 0 && <span className="text-slate-400 font-normal">({items.length})</span>}</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAll} className="flex items-center gap-1 px-2 py-1.5 text-xs text-[#E40043] hover:bg-[#FFF0F3] rounded-md">
                  <CheckCheck size={14} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:bg-slate-100" aria-label="Close">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto overscroll-contain">
            {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
            {isLoading && items.length === 0 ? (
              <div className="p-4 flex flex-col gap-2">{[1, 2, 3].map(i => <div key={i} className="skeleton h-12" />)}</div>
            ) : items.length === 0 && !error ? (
              <p className="px-4 py-10 text-center text-sm text-slate-400">You're all caught up — no alerts.</p>
            ) : (
              items.map(a => (
                <button
                  key={a.key}
                  onClick={() => openAlert(a)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 transition-[background-color,opacity] duration-200 ${a.read ? 'opacity-60' : ''}`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[a.severity] ?? DOT.info}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm ${a.read ? 'font-medium' : 'font-semibold'} text-slate-800`}>{a.title}</span>
                      {a.occurredAt && <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(a.occurredAt)}</span>}
                    </span>
                    <span className="block text-xs text-slate-600 break-words">{a.message}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  );
}
