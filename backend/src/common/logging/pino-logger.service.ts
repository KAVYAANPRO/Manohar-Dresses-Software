import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';
import { RequestContextStore } from '../context/request-context';

/**
 * Structured JSON logs with the request ID on every line (NFR-11, T-13), sourced from the
 * same AsyncLocalStorage context the audit plugin and party-scope checks read. Deliberately
 * a thin wrapper around `pino` directly rather than the `nestjs-pino` HTTP middleware, to
 * avoid two independent request-id generators racing (ours in
 * RequestContextMiddleware, tech.md §3.4 step 1, is the single source of truth).
 */
@Injectable()
export class PinoLoggerService implements LoggerService {
  private readonly logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: { level: (label) => ({ level: label }) },
  });

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('trace', message, context);
  }

  private write(
    level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
    message: unknown,
    context?: string,
    trace?: string,
  ) {
    const ctx = RequestContextStore.get();
    this.logger[level]({
      requestId: ctx?.requestId,
      userId: ctx?.userId,
      context,
      trace,
      msg: typeof message === 'string' ? message : undefined,
      data: typeof message === 'string' ? undefined : message,
    });
  }
}
