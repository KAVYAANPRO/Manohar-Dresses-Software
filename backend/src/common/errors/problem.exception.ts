import { HttpException } from '@nestjs/common';

/**
 * RFC 9457 problem+json error (tech.md §10.2). `code` is the stable machine-readable
 * identifier the frontend switches on; `detail` is for humans; `fieldErrors` is for forms.
 */
export class ProblemException extends HttpException {
  constructor(
    public readonly code: string,
    status: number,
    detail: string,
    public readonly fieldErrors?: Record<string, string>,
    public readonly extra?: Record<string, unknown>,
  ) {
    super({ code, detail, fieldErrors, ...extra }, status);
  }
}

export class UnauthenticatedException extends ProblemException {
  constructor(detail = 'Authentication is required.') {
    super('UNAUTHENTICATED', 401, detail);
  }
}

export class ForbiddenProblemException extends ProblemException {
  constructor(detail = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', 403, detail);
  }
}

export class NotFoundProblemException extends ProblemException {
  constructor(detail = 'The requested resource was not found.') {
    super('NOT_FOUND', 404, detail);
  }
}

export class ValidationFailedException extends ProblemException {
  constructor(fieldErrors: Record<string, string>, detail = 'Validation failed.') {
    super('VALIDATION_FAILED', 422, detail, fieldErrors);
  }
}

export class ConflictVersionException extends ProblemException {
  constructor(detail = 'The record was changed by someone else. Reload and try again.') {
    super('CONFLICT_VERSION', 412, detail);
  }
}

export class DuplicateNumberException extends ProblemException {
  constructor(detail: string) {
    super('DUPLICATE_NUMBER', 409, detail);
  }
}

export class InsufficientStockException extends ProblemException {
  constructor(detail: string, extra?: Record<string, unknown>) {
    super('INSUFFICIENT_STOCK', 409, detail, undefined, extra);
  }
}

export class InvalidStateTransitionException extends ProblemException {
  constructor(detail: string, extra?: Record<string, unknown>) {
    super('INVALID_STATE_TRANSITION', 409, detail, undefined, extra);
  }
}

export class IdempotencyKeyReusedException extends ProblemException {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_REUSED',
      422,
      'This Idempotency-Key was already used with a different request body.',
    );
  }
}

export class OverReceiptToleranceExceededException extends ProblemException {
  constructor(detail: string, extra?: Record<string, unknown>) {
    super('OVER_RECEIPT_TOLERANCE_EXCEEDED', 409, detail, undefined, extra);
  }
}

export class NumberSeriesMissingException extends ProblemException {
  constructor(docType: string, fy: string) {
    super('NUMBER_SERIES_MISSING', 409, `No number series configured for ${docType} in FY ${fy}.`);
  }
}
