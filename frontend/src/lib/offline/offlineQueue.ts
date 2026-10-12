/**
 * Local-first write queue: while offline, actions (e.g. "create this sales order") are pushed
 * here and persisted to localStorage instead of failing. Once back online, `syncOfflineQueue`
 * replays each one through the real handler for its `type` and drops it from the queue on
 * success. This is genuinely queued and synced client-side — the actual server write on sync
 * is only as real as the handler passed in (see each form's usage for what's wired vs. still a
 * placeholder, since most of this app's write endpoints aren't built on the backend yet).
 */
export interface QueuedAction<T = unknown> {
  id: string;
  type: string;
  payload: T;
  createdAt: string;
  /** Set when the server refused it (e.g. stock no longer available) - kept so nothing is lost. */
  lastError?: string;
  attempts?: number;
}

const STORAGE_KEY = 'office_erp_offline_queue';
const CHANGE_EVENT = 'office-erp-offline-queue-changed';

function readQueue(): QueuedAction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedAction[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // localStorage unavailable (private mode, quota) — queue just won't persist across reloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function enqueueOfflineAction<T>(type: string, payload: T): void {
  const queue = readQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type, payload, createdAt: new Date().toISOString() });
  writeQueue(queue);
}

export function getOfflineQueue(): QueuedAction[] {
  return readQueue();
}

export function removeOfflineAction(id: string): void {
  writeQueue(readQueue().filter(a => a.id !== id));
}

export function subscribeToOfflineQueue(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener('storage', callback);
  };
}

function markFailed(id: string, message: string): void {
  writeQueue(readQueue().map(a => (a.id === id ? { ...a, lastError: message, attempts: (a.attempts ?? 0) + 1 } : a)));
}

let syncing: Promise<{ synced: number; failed: number }> | null = null;

/**
 * Replays queued actions (oldest first) through the matching handler and removes each one the
 * server accepts. If the connection drops mid-way it stops and leaves the rest queued. If the
 * server refuses one (validation, stock gone ...) it is kept with the reason so the user can fix
 * or discard it - never silently dropped. Unmatched types are left queued.
 */
export function syncOfflineQueue(
  handlers: Record<string, (payload: unknown) => Promise<void>>
): Promise<{ synced: number; failed: number }> {
  if (syncing) return syncing;
  syncing = (async () => {
    let synced = 0;
    let failed = 0;
    for (const action of readQueue()) {
      const handler = handlers[action.type];
      if (!handler) continue;
      try {
        await handler(action.payload);
        removeOfflineAction(action.id);
        synced++;
      } catch (err) {
        const e = err as { response?: { data?: { detail?: string } }; message?: string };
        if (!e?.response) break; // still offline - try again later
        markFailed(action.id, e.response.data?.detail ?? e.message ?? 'The server refused this change.');
        failed++;
      }
    }
    return { synced, failed };
  })().finally(() => { syncing = null; });
  return syncing;
}
