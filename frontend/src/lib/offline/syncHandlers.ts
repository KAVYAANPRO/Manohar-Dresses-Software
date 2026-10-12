import { apiClient } from '../api/client';
import type { QueuedRequest } from './submitOrQueue';

/**
 * One handler per queued action `type` (see offlineQueue.ts). Each handler is what actually
 * runs when connectivity returns.
 *
 * `sales-order.create`: SalesOrderForm queues the exact CreateSalesOrderDto body (real
 * customer / design-variant ids) while offline; it is replayed against POST /sales-orders.
 * If ATP has run out meanwhile the order is still saved server-side as a DRAFT and the
 * request rejects with the shortfall.
 */
export const offlineSyncHandlers: Record<string, (payload: unknown) => Promise<void>> = {
  'sales-order.create': async payload => {
    await apiClient.post('/sales-orders', payload);
  },
  /** Generic queued write from submitOrQueue(): same Idempotency-Key on every attempt. */
  'http.request': async payload => {
    const r = payload as QueuedRequest;
    await apiClient.request({ method: r.method, url: r.url, data: r.body, headers: { 'Idempotency-Key': r.idempotencyKey } });
  },
};
