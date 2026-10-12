import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  CreateProcessingJobDto,
  ProcessingJobsService,
  ReceiveProcessingJobDto,
} from './processing-jobs.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

const has = (u: AuthenticatedUser, p: string) => u.isSuperAdmin || u.permissions.has(p);

/** JOB-08: processing / dyeing jobs (PROCESSING job slip + issue + receipt) as one screen. */
@Controller('api/v1/processing-jobs')
@RedactFields(REDACT.JOBWORK_MONEY, REDACT.STOCK_VALUE)
export class ProcessingJobsController {
  constructor(private readonly service: ProcessingJobsService) {}

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get()
  list(@Query('status') status?: string, @Query('jobWorkerId') jobWorkerId?: string) {
    return this.service.list({ status, jobWorkerId });
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateProcessingJobDto, body);
    return this.service.create(dto, actor.id, {
      canConfirmIssue: has(actor, PERMISSIONS.ISSUE_CONFIRM),
    });
  }

  @RequirePermissions(PERMISSIONS.RECEIPT_EDIT)
  @Idempotent()
  @Post(':id/receive')
  async receive(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(ReceiveProcessingJobDto, body);
    return this.service.receive(id, dto, actor.id, {
      canEditCharges: has(actor, PERMISSIONS.RECEIPT_CHARGES_EDIT),
      canConfirm: has(actor, PERMISSIONS.RECEIPT_CONFIRM),
    });
  }

  /** Send processed output (e.g. a dyed dupatta) on to the parent job slip's karigar, if not done yet. */
  @RequirePermissions(PERMISSIONS.ISSUE_EDIT, PERMISSIONS.ISSUE_CONFIRM)
  @Idempotent()
  @Post(':id/forward')
  forward(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.forwardToParent(id, actor.id);
  }
}
