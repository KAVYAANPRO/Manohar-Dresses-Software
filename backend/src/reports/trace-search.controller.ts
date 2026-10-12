import { Controller, Get, Query } from '@nestjs/common';
import { TraceSearchService } from './trace-search.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { ForbiddenProblemException } from '../common/errors/problem.exception';

/** Any one of these is enough to open the trace view (it shows the same records those screens do). */
export const TRACE_PERMISSIONS = [
  PERMISSIONS.JOBSLIP_VIEW,
  PERMISSIONS.SALES_INVOICE_VIEW,
  PERMISSIONS.STOCK_VIEW,
  PERMISSIONS.PURCHASE_VIEW,
  PERMISSIONS.INWARD_VIEW,
];

/** TRC-01 search by reference. Internal users only; no costs or rates are returned. */
@Controller('api/v1/trace')
export class TraceSearchController {
  constructor(private readonly service: TraceSearchService) {}

  @RequirePermissions()
  @Get()
  search(@Query('ref') ref: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.principal === 'party') {
      throw new ForbiddenProblemException('Traceability is available to internal users only.');
    }
    if (!user.isSuperAdmin && !TRACE_PERMISSIONS.some((p) => user.permissions.has(p))) {
      throw new ForbiddenProblemException(
        `Missing permission: one of ${TRACE_PERMISSIONS.join(', ')}`,
      );
    }
    return this.service.search(ref);
  }
}
