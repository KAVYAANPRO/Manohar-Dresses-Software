import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CsrfGuard } from './csrf.guard';
import { AppConfig } from '../../config/configuration';
import { ForbiddenProblemException } from '../errors/problem.exception';
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '../../identity/identity.constants';

/**
 * Exercises the actual security logic directly - CSRF is only meaningful for a browser, and
 * the e2e suite's supertest client never is one, so this is where the guard's real behaviour
 * is proven, without retrofitting a CSRF header onto every mutating call in every e2e spec.
 */
describe('CsrfGuard (tech.md §9.1)', () => {
  function makeContext(opts: {
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
  }): ExecutionContext {
    const req = {
      method: opts.method ?? 'POST',
      cookies: opts.cookies ?? {},
      headers: opts.headers ?? {},
    };
    return {
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
  }

  function makeGuard(nodeEnv: string, corsOrigins: string[] = ['https://admin.example.com']) {
    const config = {
      get: (key: string) => (key === 'nodeEnv' ? nodeEnv : corsOrigins),
    } as unknown as ConfigService<AppConfig, true>;
    return new CsrfGuard(config);
  }

  it('is a no-op in the test environment', () => {
    const guard = makeGuard('test');
    expect(guard.canActivate(makeContext({ headers: {} }))).toBe(true);
  });

  it('allows safe methods (GET) through regardless of cookies/headers', () => {
    const guard = makeGuard('production');
    expect(guard.canActivate(makeContext({ method: 'GET' }))).toBe(true);
  });

  it('allows a mutating request through when there is no session cookie (nothing to protect)', () => {
    const guard = makeGuard('production');
    expect(guard.canActivate(makeContext({ method: 'POST', cookies: {} }))).toBe(true);
  });

  it('allows a mutating request with a session cookie, an allowlisted Origin and a matching token', () => {
    const guard = makeGuard('production');
    const ctx = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'session-token', [CSRF_COOKIE_NAME]: 'csrf-abc' },
      headers: { origin: 'https://admin.example.com', [CSRF_HEADER_NAME]: 'csrf-abc' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rejects an allowlisted Origin that is missing the CSRF token (defence in depth)', () => {
    const guard = makeGuard('production');
    const ctx = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'session-token', [CSRF_COOKIE_NAME]: 'csrf-abc' },
      headers: { origin: 'https://admin.example.com' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenProblemException);
  });

  it('rejects a mutating request with a session cookie and a non-allowlisted Origin, even with a valid token', () => {
    const guard = makeGuard('production');
    const ctx = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'session-token', [CSRF_COOKIE_NAME]: 'csrf-abc' },
      headers: { origin: 'https://attacker.example.com', [CSRF_HEADER_NAME]: 'csrf-abc' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenProblemException);
  });

  it('with no Origin header, allows the request when the CSRF cookie matches the header (double-submit)', () => {
    const guard = makeGuard('production');
    const ctx = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'session-token', [CSRF_COOKIE_NAME]: 'csrf-abc' },
      headers: { [CSRF_HEADER_NAME]: 'csrf-abc' },
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('with no Origin header, rejects when the CSRF header is missing', () => {
    const guard = makeGuard('production');
    const ctx = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'session-token', [CSRF_COOKIE_NAME]: 'csrf-abc' },
      headers: {},
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenProblemException);
  });

  it('with no Origin header, rejects when the CSRF header does not match the cookie', () => {
    const guard = makeGuard('production');
    const ctx = makeContext({
      cookies: { [SESSION_COOKIE_NAME]: 'session-token', [CSRF_COOKIE_NAME]: 'csrf-abc' },
      headers: { [CSRF_HEADER_NAME]: 'wrong-value' },
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenProblemException);
  });
});
