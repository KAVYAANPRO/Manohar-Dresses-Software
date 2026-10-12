import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProblemException } from '../errors/problem.exception';

/**
 * Every error leaving the API is application/problem+json (tech.md §10.2), with a stable
 * `code` the frontend can switch on. Unknown errors never leak internals to the client.
 */
@Catch()
export class ProblemExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof ProblemException) {
      const body = exception.getResponse() as Record<string, unknown>;
      response
        .status(exception.getStatus())
        .contentType('application/problem+json')
        .json({
          ...body,
          status: exception.getStatus(),
          instance: request.originalUrl,
        });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const detail = typeof raw === 'string' ? raw : ((raw as any)?.message ?? exception.message);
      const fieldErrors =
        typeof raw === 'object' && Array.isArray((raw as any)?.message)
          ? this.flattenValidationErrors((raw as any).message)
          : undefined;
      response
        .status(status)
        .contentType('application/problem+json')
        .json({
          code: fieldErrors ? 'VALIDATION_FAILED' : this.codeForStatus(status),
          detail: Array.isArray(detail) ? detail.join('; ') : detail,
          fieldErrors,
          status,
          instance: request.originalUrl,
        });
      return;
    }

    // Errors raised by Express middleware before Nest (body-parser: oversized or malformed JSON)
    // carry a 4xx `status` - report them as the client error they are, with a safe message.
    const mwStatus = (exception as { status?: unknown; type?: unknown } | null)?.status;
    if (typeof mwStatus === 'number' && mwStatus >= 400 && mwStatus < 500) {
      const tooLarge = mwStatus === 413;
      response
        .status(mwStatus)
        .contentType('application/problem+json')
        .json({
          code: tooLarge ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
          detail: tooLarge ? 'Request body is too large.' : 'Malformed request body.',
          status: mwStatus,
          instance: request.originalUrl,
        });
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).contentType('application/problem+json').json({
      code: 'INTERNAL',
      detail: 'An unexpected error occurred.',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      instance: request.originalUrl,
    });
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case 401:
        return 'UNAUTHENTICATED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 429:
        return 'RATE_LIMITED';
      default:
        return 'ERROR';
    }
  }

  private flattenValidationErrors(messages: string[]): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of messages) {
      const field = m.split(' ')[0];
      out[field] = m;
    }
    return out;
  }
}
