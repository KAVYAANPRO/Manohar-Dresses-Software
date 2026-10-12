import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { AuthService } from '../../identity/auth.service';
import { SESSION_COOKIE_NAME } from '../../identity/identity.constants';
import { RequestContextStore } from '../context/request-context';
import { UnauthenticatedException } from '../errors/problem.exception';

/**
 * Global guard (AUTH-05: every request authorised on the server, never trusting the client).
 * Resolves the session cookie into req.user and mirrors it into the AsyncLocalStorage
 * request context. Public routes still get req.user populated when a valid cookie is
 * present, so e.g. GET /auth/me works the same way as any other route.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawToken = req.cookies?.[SESSION_COOKIE_NAME];

    if (rawToken) {
      const result = await this.authService.validateSession(rawToken);
      if (result) {
        req.user = result.user;
        req.sessionId = result.sessionId;
        const ctx = RequestContextStore.get();
        if (ctx) {
          ctx.userId = result.user.id;
          ctx.username = result.user.username;
          ctx.principal = result.user.principal;
          ctx.jobWorkerId = result.user.jobWorkerId;
          ctx.permissions = result.user.permissions;
        }
      }
    }

    if (isPublic) return true;
    if (!req.user) throw new UnauthenticatedException();
    return true;
  }
}
