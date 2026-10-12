import { AsyncLocalStorage } from 'node:async_hooks';

export type Principal = 'internal' | 'party' | 'system';

/**
 * Everything the rest of the app needs to know about "who is asking", carried without
 * threading it through every function signature. This is Mongo's stand-in for the
 * `SET LOCAL app.*` request context tech.md §3.4 describes for Postgres: there is no
 * database-level RLS to fall back on, so every party-scoped query MUST read this context
 * explicitly (see PartyScopeService) - there is no second line of defence.
 */
export interface RequestContext {
  requestId: string;
  userId: string | null;
  username: string | null;
  principal: Principal;
  jobWorkerId: string | null;
  permissions: Set<string>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },

  /** Fails closed: callers must handle `undefined` as "no authenticated context". */
  get(): RequestContext | undefined {
    return storage.getStore();
  },

  getOrThrow(): RequestContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('RequestContext accessed outside of a request. This is a bug.');
    }
    return ctx;
  },
};
