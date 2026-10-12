import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { JobReceiptsService } from './job-receipts.service';
import { JobReconciliationService } from './job-reconciliation.service';
import {
  ShortageTolerancesService,
  UpsertShortageToleranceDto,
} from './shortage-tolerances.service';
import { CancelJobReceiptDto, CreateJobReceiptDto } from './dto/job-receipt.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/job-receipts')
@RedactFields(REDACT.JOBWORK_MONEY, REDACT.STOCK_VALUE)
export class JobReceiptsController {
  constructor(private readonly service: JobReceiptsService) {}

  /** ?jobSlipId=…  ?jobWorkerId=…  ?jobType=MANUFACTURING|PROCESSING  ?status=DRAFT|CONFIRMED|CANCELLED */
  @RequirePermissions(PERMISSIONS.RECEIPT_VIEW)
  @Get()
  list(
    @Query('jobSlipId') jobSlipId?: string,
    @Query('jobWorkerId') jobWorkerId?: string,
    @Query('jobType') jobType?: string,
    @Query('status') status?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (jobSlipId) filter.jobSlipId = jobSlipId;
    if (jobWorkerId) filter.jobWorkerId = jobWorkerId;
    if (jobType) filter.jobType = jobType;
    if (status) filter.status = status;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.RECEIPT_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  /** Body may carry `confirm: true` to create and post in one call. */
  @RequirePermissions(PERMISSIONS.RECEIPT_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateJobReceiptDto, body);
    if (dto.confirm && !actor.isSuperAdmin && !actor.permissions.has(PERMISSIONS.RECEIPT_CONFIRM)) {
      dto.confirm = false; // saved as draft; a user with receipt.confirm posts it
    }
    return this.service.create(dto, actor.id, {
      canEditCharges:
        actor.isSuperAdmin || actor.permissions.has(PERMISSIONS.RECEIPT_CHARGES_EDIT),
    });
  }

  @RequirePermissions(PERMISSIONS.RECEIPT_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.RECEIPT_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelJobReceiptDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}

@Controller('api/v1/job-slips/:jobSlipId')
@RedactFields(REDACT.JOBWORK_MONEY, REDACT.STOCK_VALUE)
export class JobComparisonController {
  constructor(private readonly reconciliation: JobReconciliationService) {}

  /** JOB-11: expected, actual, difference (+ material and processing shortage). */
  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get('comparison')
  async comparison(@Param('jobSlipId') jobSlipId: string) {
    const s = await this.reconciliation.summary(jobSlipId);
    // Original JOB-11 shape kept (expected / actual / difference = expected - actual) + full summary.
    return {
      ...s,
      expected: s.production.expected,
      actual: s.production.received,
      difference: Math.round((s.production.expected - s.production.received) * 1000) / 1000,
    };
  }

  /** SHR-01..04 + JOB-12 close gate, with names, tolerance, blockers - the reconciliation screen. */
  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get('reconciliation-summary')
  summary(@Param('jobSlipId') jobSlipId: string) {
    return this.reconciliation.summary(jobSlipId);
  }
}

/** SHR-03: tolerance % per material / processing type / party. */
@Controller('api/v1/shortage-tolerances')
export class ShortageTolerancesController {
  constructor(private readonly service: ShortageTolerancesService) {}

  @RequirePermissions(PERMISSIONS.SHORTAGE_VIEW)
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions(PERMISSIONS.SHORTAGE_APPROVE)
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(UpsertShortageToleranceDto, body);
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SHORTAGE_APPROVE)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.deactivate(id, actor.id);
  }
}
