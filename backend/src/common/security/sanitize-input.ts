import { NextFunction, Request, Response } from 'express';

/**
 * NoSQL-injection guard (NFR-04). Mongo treats object keys starting with `$` as operators and
 * keys containing `.` as nested paths, so a client-supplied `{ "status": { "$ne": null } }` or
 * `?status[$ne]=x` that reaches a `find()` filter changes the query's meaning. DTO validation
 * already whitelists most bodies, but not every route takes a DTO, so this runs on every request:
 *
 * - query strings use Express's "simple" parser (set in main.ts), so `?a[$ne]=x` stays a flat key
 *   instead of becoming a nested object; any operator-looking key is dropped here as well;
 * - JSON bodies are walked recursively and operator / dotted keys are removed.
 *
 * Legitimate payloads never use such keys - operators are only ever built server-side.
 */
const MAX_DEPTH = 20;

function isUnsafeKey(key: string): boolean {
  return key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype';
}

export function stripUnsafeKeys(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => stripUnsafeKeys(v, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (isUnsafeKey(key)) continue;
    out[key] = stripUnsafeKeys(v, depth + 1);
  }
  return out;
}

export function sanitizeInputMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') req.body = stripUnsafeKeys(req.body);
  if (req.query && typeof req.query === 'object') {
    // Express 4 exposes req.query as a plain writable property.
    (req as unknown as { query: unknown }).query = stripUnsafeKeys(req.query);
  }
  next();
}
