import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InwardsService } from './inwards.service';
import { CancelInwardDto, CreateDirectInwardDto, CreateInwardDto } from './dto/inward.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';
import { ForbiddenProblemException } from '../common/errors/problem.exception';

@Controller('api/v1/inwards')
@RedactFields(REDACT.PURCHASE_RATES)
export class InwardsController {
  constructor(private readonly service: InwardsService) {}

  @RequirePermissions(PERMISSIONS.INWARD_VIEW)
  @Get()
  list(
    @Query('status') status?: string,
    @Query('purchaseId') purchaseId?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (purchaseId) filter.purchaseId = purchaseId;
    if (supplierId) filter.supplierId = supplierId;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.INWARD_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  /** INW-01: inward against a confirmed purchase. Body `confirm: true` also posts stock (needs inward.confirm). */
  @RequirePermissions(PERMISSIONS.INWARD_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateInwardDto, body);
    if (dto.confirm && !actor.isSuperAdmin && !actor.permissions.has(PERMISSIONS.INWARD_CONFIRM)) {
      throw new ForbiddenProblemException(`Missing permission ${PERMISSIONS.INWARD_CONFIRM}.`);
    }
    return this.service.create(dto, actor.id);
  }

  /** Direct inward (no PO first): raises a confirmed purchase behind it and confirms the inward - one transaction. */
  @RequirePermissions(PERMISSIONS.INWARD_EDIT, PERMISSIONS.INWARD_CONFIRM)
  @Idempotent()
  @Post('direct')
  async createDirect(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateDirectInwardDto, body);
    return this.service.createDirect(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.INWARD_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.INWARD_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelInwardDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
