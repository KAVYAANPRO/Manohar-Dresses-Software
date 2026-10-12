import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductionLookupsService } from './production-lookups.service';
import { JobSlipsService } from './job-slips.service';
import {
  CancelJobSlipDto,
  CreateJobSlipDto,
  SetJobSlipStatusDto,
  ShortCloseJobSlipDto,
  UpdateJobSlipDto,
  WriteOffJobSlipDto,
} from './dto/job-slip.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/job-slips')
@RedactFields(REDACT.JOBWORK_MONEY, REDACT.STOCK_VALUE)
export class JobSlipsController {
  constructor(
    private readonly service: JobSlipsService,
    private readonly lookups: ProductionLookupsService,
  ) {}

  /** `status` may be a comma-separated list (e.g. CREATED,MATERIAL_ISSUED). */
  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get()
  list(
    @Query('status') status?: string,
    @Query('jobWorkerId') jobWorkerId?: string,
    @Query('designId') designId?: string,
    @Query('jobType') jobType?: string,
    @Query('productionOrderId') productionOrderId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (status) {
      const statuses = status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (jobWorkerId) filter.jobWorkerId = jobWorkerId;
    if (designId) filter.designId = designId;
    if (jobType) filter.jobType = jobType;
    if (productionOrderId) filter.productionOrderId = productionOrderId;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get('overdue')
  overdue() {
    return this.service.overdue();
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  /** BOM requirement vs issued vs MAIN-WH stock for this slip (the Issue Materials screen). */
  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get(':id/issue-plan')
  issuePlan(@Param('id') id: string) {
    return this.lookups.issuePlan(id);
  }

  /** Header edits only (dates, rate, instructions) - see JobSlipsService.update for the rules. */
  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(UpdateJobSlipDto, body);
    return this.service.update(id, dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get(':id/reconciliation')
  reconciliation(@Param('id') id: string) {
    return this.service.getReconciliation(id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateJobSlipDto, body);
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT)
  @Post(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(SetJobSlipStatusDto, body);
    return this.service.setStatus(id, dto.status, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT)
  @Post(':id/short-close')
  async shortClose(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(ShortCloseJobSlipDto, body);
    return this.service.shortClose(id, dto.reason, actor.id);
  }

  @RequirePermissions(PERMISSIONS.WRITEOFF_APPROVE)
  @Post(':id/write-off')
  async writeOff(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(WriteOffJobSlipDto, body);
    return this.service.writeOff(id, dto.reason, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_CLOSE)
  @Idempotent()
  @Post(':id/close')
  close(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.close(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelJobSlipDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
