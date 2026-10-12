import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { LabelResolverService } from './label-resolver.service';

/** Adds `<x>Name` labels beside raw `<x>Id` fields of every JSON report row (see LabelResolverService). */
@Injectable()
export class ReportLabelsInterceptor implements NestInterceptor {
  constructor(private readonly labels: LabelResolverService) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(
        mergeMap((data) =>
          Array.isArray(data) ? from(this.labels.enrich(data)) : from(Promise.resolve(data)),
        ),
      );
  }
}
