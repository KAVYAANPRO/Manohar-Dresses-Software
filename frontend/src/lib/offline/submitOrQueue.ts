import { apiClient } from '../api/client';
import { enqueueOfflineAction } from './offlineQueue';

/** Body of a queued generic API write (replayed by the 'http.request' sync handler). */
export interface QueuedRequest {
  method: 'POST' | 'PATCH' | 'PUT';
  url: string;
  body?: unknown;
  /** Fixed once, so a replay that already reached the server is never applied twice. */
  idempotencyKey: string;
  /** Human description shown in the pending-sync list, e.g. "Job slip for Kavyan (KAV-12)". */
  label: string;
}

export type SubmitResult<T> = { queued: false; data: T } | { queued: true };

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** No response at all = the request never reached the server (offline / network drop). */
function isNetworkFailure(err: unknown): boolean {
  const e = err as { response?: unknown; code?: string; message?: string };
  return !e?.response && (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED' || /network/i.test(e?.message ?? ''));
}

/**
 * Sends a create/update to the server - or, when there is no internet, saves it on this device
 * and returns `{ queued: true }`. Queued writes are sent automatically when the connection comes
 * back (OfflineBanner) and removed from the device once the server accepts them. The same
 * Idempotency-Key is used for every attempt, so nothing can be created twice.
 */
export async function submitOrQueue<T>(req: Omit<QueuedRequest, 'idempotencyKey'> & { idempotencyKey?: string }): Promise<SubmitResult<T>> {
  const full: QueuedRequest = { ...req, idempotencyKey: req.idempotencyKey ?? newKey() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    enqueueOfflineAction<QueuedRequest>('http.request', full);
    return { queued: true };
  }
  try {
    const res = await apiClient.request<T>({ method: full.method, url: full.url, data: full.body, headers: { 'Idempotency-Key': full.idempotencyKey } });
    return { queued: false, data: res.data };
  } catch (err) {
    if (isNetworkFailure(err)) {
      enqueueOfflineAction<QueuedRequest>('http.request', full);
      return { queued: true };
    }
    throw err;
  }
}
