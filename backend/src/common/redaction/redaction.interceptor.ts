import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { REDACT_RULES_KEY, RedactionRule, fieldsToRedact, stripFields } from './redaction';

/**
 * Global response redaction (AUTH-07). Reads @RedactFields rules from the controller class and
 * the handler (both apply), and strips the money fields the caller is not entitled to before
 * the body is serialised. Routes without rules pay nothing.
 */
@Injectable()
export class RedactionInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const rules = [
      ...(this.reflector.get<RedactionRule[]>(REDACT_RULES_KEY, context.getClass()) ?? []),
      ...(this.reflector.get<RedactionRule[]>(REDACT_RULES_KEY, context.getHandler()) ?? []),
    ];
    if (rules.length === 0) return next.handle();

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    // No user on a rule-bearing route means a public route: redact everything to fail closed.
    const fields = fieldsToRedact(
      rules,
      user?.permissions ?? new Set(),
      user?.isSuperAdmin ?? false,
    );
    if (fields.size === 0) return next.handle();
    return next.handle().pipe(map((body) => stripFields(body, fields)));
  }
}
