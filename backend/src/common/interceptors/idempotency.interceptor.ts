import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Reflector } from '@nestjs/core';
import { Model } from 'mongoose';
import { createHash } from 'node:crypto';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { IdempotencyKeyRecord, IdempotencyKeyDocument } from '../schemas/idempotency-key.schema';
import { IDEMPOTENT_KEY } from '../decorators/idempotent.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';
import { IdempotencyKeyReusedException, ProblemException } from '../errors/problem.exception';

/**
 * tech.md §10.2: "The key, request hash, and stored response are written in the same
 * transaction as the effect, so a retry returns the original result... Reusing a key with a
 * different body is 422 IDEMPOTENCY_KEY_REUSED." This interceptor implements the HTTP-layer
 * half (claim-then-record); the "same transaction" guarantee is the responsibility of the
 * command handler itself when it writes its own domain state.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectModel(IdempotencyKeyRecord.name) private readonly model: Model<IdempotencyKeyDocument>,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isIdempotent = this.reflector.getAllAndOverride<boolean>(IDEMPOTENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!isIdempotent) return next.handle();

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const key = req.header('Idempotency-Key');
    if (!key) return next.handle();

    const userId = req.user?.id ?? 'anonymous';
    const endpoint = `${req.method} ${req.route?.path ?? req.path}`;
    const requestHash = createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');

    return from(this.claim(userId, key, endpoint, requestHash)).pipe(
      switchMap((existing) => {
        if (existing?.responseStatus !== undefined) {
          const res = context.switchToHttp().getResponse();
          res.status(existing.responseStatus);
          return of(existing.responseBody);
        }
        return next.handle().pipe(
          tap((body) => {
            const res = context.switchToHttp().getResponse();
            void this.model
              .updateOne(
                { userId, key },
                { $set: { responseStatus: res.statusCode, responseBody: body } },
              )
              .exec();
          }),
        );
      }),
    );
  }

  private async claim(
    userId: string,
    key: string,
    endpoint: string,
    requestHash: string,
  ): Promise<IdempotencyKeyDocument | null> {
    const existing = await this.model.findOne({ userId, key });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new IdempotencyKeyReusedException();
      if (existing.responseStatus === undefined) {
        throw new ProblemException(
          'IDEMPOTENCY_IN_PROGRESS',
          409,
          'This request is already being processed.',
        );
      }
      return existing;
    }

    try {
      await this.model.create({ userId, key, endpoint, requestHash });
      return null;
    } catch (err: any) {
      if (err?.code === 11000) {
        // Lost the race to claim the key; treat as a concurrent duplicate.
        const raced = await this.model.findOne({ userId, key });
        if (raced && raced.requestHash !== requestHash) throw new IdempotencyKeyReusedException();
        throw new ProblemException(
          'IDEMPOTENCY_IN_PROGRESS',
          409,
          'This request is already being processed.',
        );
      }
      throw err;
    }
  }
}
