import { timingSafeEqual } from 'node:crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../identity/identity.constants';
import { ForbiddenProblemException } from '../errors/problem.exception';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * tech.md §9.1: "an anti-forgery token ... together with an Origin check." CSRF only exists
 * as an attack against a browser that is automatically attaching a cookie on the victim's
 * behalf, so this only ever engages when the request actually carries the session cookie -
 * a non-browser API caller with no session cookie has nothing here to bypass.
 *
 * Both checks apply to every cookie-carrying mutating request (defence in depth):
 * - Origin, when present (every modern browser sends it on state-changing fetch/XHR), must be
 *   on the configured allowlist (CORS_ORIGINS), or the request is refused.
 * - The double-submit token must always match: the CSRF cookie value echoed back in the
 *   X-CSRF-Token header. A cross-site attacker page can trigger the cookie-carrying request but
 *   cannot read the cookie's value (same-origin policy), so it cannot produce a matching header.
 *   Requiring it even when Origin is allowlisted means a misconfigured allowlist or a proxy that
 *   rewrites Origin is not, on its own, enough to forge a request.
 *
 * Skipped in the test environment - exercised in isolation by csrf.guard.spec.ts instead of
 * retrofitting a CSRF header onto every one of the existing e2e suite's HTTP calls, which
 * never go through a browser in the first place (the whole point of CSRF).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get('nodeEnv', { infer: true }) === 'test') return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (!req.cookies?.[SESSION_COOKIE_NAME]) return true;

    const origin = req.headers.origin;
    if (origin) {
      const allowed = this.config.get('corsOrigins', { infer: true });
      if (!allowed.includes(origin)) {
        throw new ForbiddenProblemException('Request origin is not permitted.');
      }
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME];
    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string' || !tokensMatch(cookieToken, headerToken)) {
      throw new ForbiddenProblemException('Missing or invalid CSRF token.');
    }
    return true;
  }
}

/** Constant-time comparison so the token can't be recovered byte-by-byte from response timing. */
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length > 0 && ab.length === bb.length && timingSafeEqual(ab, bb);
}
