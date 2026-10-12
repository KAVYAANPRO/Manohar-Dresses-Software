import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { DURATION, EASE_OUT } from '../ui/motionTokens';
import { useOnlineStatus } from '../../lib/offline/useOnlineStatus';
import { getOfflineQueue, removeOfflineAction, subscribeToOfflineQueue, syncOfflineQueue, type QueuedAction } from '../../lib/offline/offlineQueue';
import { offlineSyncHandlers } from '../../lib/offline/syncHandlers';

const labelOf = (a: QueuedAction) => (a.payload as { label?: string } | null)?.label ?? a.type.replace(/[.-]/g, ' ');

/**
 * Offline status + the list of changes saved on this device. Pending changes are sent the moment
 * the connection returns (and every 30 s while online); ones the server refused stay listed with
 * the reason, with Retry / Discard, so nothing is ever lost silently.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [queue, setQueue] = useState<QueuedAction[]>(getOfflineQueue());
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => subscribeToOfflineQueue(() => setQueue(getOfflineQueue())), []);

  const runSync = async () => {
    setSyncing(true);
    const { synced } = await syncOfflineQueue(offlineSyncHandlers);
    setSyncing(false);
    if (synced > 0) {
      setJustSynced(synced);
      setTimeout(() => setJustSynced(0), 4000);
    }
  };

  // Sync the moment connectivity returns, and keep trying while online.
  useEffect(() => {
    if (!online) return;
    if (getOfflineQueue().some(a => !a.lastError)) runSync();
    const t = window.setInterval(() => { if (getOfflineQueue().some(a => !a.lastError)) runSync(); }, 30_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const failed = queue.filter(a => a.lastError);
  const pending = queue.filter(a => !a.lastError);
  const show = !online || queue.length > 0 || justSynced > 0;

  const tone = !online ? 'bg-amber-500 text-white' : failed.length ? 'bg-red-600 text-white' : justSynced ? 'bg-green-600 text-white' : 'bg-[#E40043] text-white';

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="offline-banner"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1, transition: { duration: DURATION.base, ease: EASE_OUT } }}
          exit={{ height: 0, opacity: 0, transition: { duration: DURATION.base } }}
          style={{ overflow: 'hidden' }}
          className="shrink-0"
          role="status"
          aria-live="polite"
        >
          <div className={`px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center transition-colors duration-300 ${tone}`}>
            {!online ? (
              <>
                <WifiOff size={13} className="shrink-0" />
                You’re offline — what you save is kept on this device and sent automatically when you’re back online
                {queue.length > 0 && <span className="font-bold">({queue.length} saved on device)</span>}
              </>
            ) : justSynced && !queue.length ? (
              <><CheckCircle2 size={13} className="animate-pop" /> Back online — {justSynced} saved change{justSynced > 1 ? 's' : ''} sent to the server.</>
            ) : (
              <>
                {failed.length ? <AlertTriangle size={13} /> : <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}
                {syncing ? 'Sending saved changes…' : failed.length
                  ? `${failed.length} saved change${failed.length > 1 ? 's' : ''} couldn’t be sent${pending.length ? ` · ${pending.length} waiting` : ''}`
                  : `${pending.length} change${pending.length > 1 ? 's' : ''} waiting to be sent`}
                {!syncing && pending.length > 0 && <button onClick={runSync} className="underline hover:no-underline ml-1 py-1">Send now</button>}
              </>
            )}
            {queue.length > 0 && (
              <button onClick={() => setOpen(o => !o)} className="inline-flex items-center gap-1 underline hover:no-underline py-1" aria-expanded={open}>
                {open ? 'Hide' : 'View'} <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>

          <AnimatePresence initial={false}>
            {open && queue.length > 0 && (
              <motion.ul initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden bg-white border-b border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {queue.map(a => (
                  <li key={a.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{labelOf(a)}</p>
                      <p className="text-xs text-muted">Saved {new Date(a.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      {a.lastError && <p className="text-xs text-red-600 mt-0.5">Not saved: {a.lastError}</p>}
                    </div>
                    {a.lastError && online && (
                      <button
                        type="button"
                        className="shrink-0 min-h-9 px-3 rounded-md text-xs font-semibold border border-[var(--color-border)]"
                        onClick={() => {
                          // Clear the error so the next sync retries it.
                          const q = getOfflineQueue().map(x => (x.id === a.id ? { ...x, lastError: undefined } : x));
                          try { localStorage.setItem('office_erp_offline_queue', JSON.stringify(q)); } catch { /* ignore */ }
                          window.dispatchEvent(new Event('office-erp-offline-queue-changed'));
                          runSync();
                        }}
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      className="shrink-0 w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-red-600"
                      aria-label="Discard"
                      onClick={() => { if (window.confirm(`Discard “${labelOf(a)}”? It will not be sent.`)) removeOfflineAction(a.id); }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
