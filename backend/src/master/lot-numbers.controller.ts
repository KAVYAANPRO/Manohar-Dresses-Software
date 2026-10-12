import { Controller, Get, Query } from '@nestjs/common';
import { LotNumbersService } from './lot-numbers.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { ProblemException } from '../common/errors/problem.exception';

@Controller('api/v1/lot-numbers')
export class LotNumbersController {
  constructor(private readonly service: LotNumbersService) {}

  /** Next lot number for a supplier (purchase inward). */
  @RequirePermissions(PERMISSIONS.INWARD_VIEW)
  @Get('next/supplier')
  nextForSupplier(@Query('partyId') partyId?: string) {
    if (!partyId) throw new ProblemException('VALIDATION_FAILED', 422, 'partyId is required.');
    return this.service.suggest('SUPPLIER', partyId);
  }

  /** Next lot number for a karigar / factory (job slip). */
  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get('next/job-worker')
  nextForJobWorker(@Query('partyId') partyId?: string) {
    if (!partyId) throw new ProblemException('VALIDATION_FAILED', 422, 'partyId is required.');
    return this.service.suggest('JOB_WORKER', partyId);
  }
}
