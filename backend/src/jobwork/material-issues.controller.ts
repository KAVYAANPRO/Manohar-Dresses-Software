import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MaterialIssuesService } from './material-issues.service';
import {
  AcknowledgeMaterialIssueDto,
  CancelMaterialIssueDto,
  CreateMaterialIssueDto,
} from './dto/material-issue.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/material-issues')
@RedactFields(REDACT.STOCK_VALUE)
export class MaterialIssuesController {
  constructor(private readonly service: MaterialIssuesService) {}

  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get()
  list(@Query('jobSlipId') jobSlipId?: string, @Query('status') status?: string) {
    const filter: Record<string, unknown> = {};
    if (jobSlipId) filter.jobSlipId = jobSlipId;
    if (status) filter.status = status;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @RequirePermissions(PERMISSIONS.ISSUE_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateMaterialIssueDto, body);
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.ISSUE_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.ISSUE_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelMaterialIssueDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }

  /** JOB-06: also reachable from the portal (own party only) - see PortalJobsController. */
  // A state change, so it needs issue.edit (not .view) when staff record it on the party's behalf.
  @RequirePermissions(PERMISSIONS.ISSUE_EDIT)
  @Post(':id/acknowledge')
  async acknowledge(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(AcknowledgeMaterialIssueDto, body);
    return this.service.acknowledge(id, dto.discrepancyNote, actor.id);
  }
}
