import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { RequestContext, RequestContextStore } from '../context/request-context';

/**
 * Opens the AsyncLocalStorage context for the whole request (tech.md §3.4 step 3's Mongo
 * equivalent of `SET LOCAL app.*`). It starts with an anonymous/system identity; the auth
 * guard that runs later mutates this same object once the session is verified, so everything
 * downstream - services, the audit plugin - sees the final values without them being threaded
 * through every function call.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    res.setHeader('x-request-id', requestId);
    (req as any).requestId = requestId;

    const ctx: RequestContext = {
      requestId,
      userId: null,
      username: null,
      principal: 'system',
      jobWorkerId: null,
      permissions: new Set<string>(),
    };

    RequestContextStore.run(ctx, () => next());
  }
}
