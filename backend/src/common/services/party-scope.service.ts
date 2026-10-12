import { Injectable } from '@nestjs/common';
import { FilterQuery } from 'mongoose';
import { RequestContext } from '../context/request-context';
import { ForbiddenProblemException, NotFoundProblemException } from '../errors/problem.exception';

/**
 * Layer 1 of party isolation (tech.md §9.3, BR-08). In tech.md's Postgres design this is
 * backed by row-level security as a second, database-enforced layer (§9.3 layer 2); Mongo has
 * no RLS equivalent, so THIS is the only line of defence and every service touching a
 * party-scoped collection must call one of these two methods - there is no fallback.
 */
@Injectable()
export class PartyScopeService {
  /** Narrows a list/find filter to the caller's own party. No-op for internal staff. */
  applyScope<T extends Record<string, unknown>>(
    filter: FilterQuery<T>,
    ctx: RequestContext,
    field = 'jobWorkerId',
  ): FilterQuery<T> {
    if (ctx.principal === 'party') {
      if (!ctx.jobWorkerId) {
        throw new ForbiddenProblemException('This account is not linked to a factory/artisan.');
      }
      return { ...filter, [field]: ctx.jobWorkerId } as FilterQuery<T>;
    }
    return filter;
  }

  /**
   * Asserts a single record's party-scoped id belongs to the caller. Throws NOT_FOUND, not
   * FORBIDDEN, so a factory probing another factory's id learns nothing (tech.md §9.3 layer 1:
   * "An ID belonging to another factory returns NOT_FOUND, not FORBIDDEN").
   */
  assertOwnParty(ownerJobWorkerId: string | null | undefined, ctx: RequestContext): void {
    if (ctx.principal !== 'party') return;
    if (!ctx.jobWorkerId || String(ownerJobWorkerId) !== ctx.jobWorkerId) {
      throw new NotFoundProblemException();
    }
  }
}
