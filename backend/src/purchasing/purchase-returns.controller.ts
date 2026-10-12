import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PurchaseReturnsService } from './purchase-returns.service';
import { CancelPurchaseReturnDto, CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';
import { ForbiddenProblemException } from '../common/errors/problem.exception';

/** PUR-08. Uses the purchase permissions: a return is a purchasing document. */
@Controller('api/v1/purchase-returns')
@RedactFields(REDACT.PURCHASE_RATES)
export class PurchaseReturnsController {
  constructor(private readonly service: PurchaseReturnsService) {}

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get()
  list(
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('inwardId') inwardId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    if (inwardId) filter.inwardId = inwardId;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW, PERMISSIONS.INWARD_VIEW)
  @Get('returnable')
  returnable(@Query('inwardId') inwardId: string, @Query('locationId') locationId?: string) {
    return this.service.returnable(inwardId, locationId);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreatePurchaseReturnDto, body);
    if (dto.confirm && !actor.isSuperAdmin && !actor.permissions.has(PERMISSIONS.PURCHASE_CONFIRM)) {
      throw new ForbiddenProblemException(`Missing permission ${PERMISSIONS.PURCHASE_CONFIRM}.`);
    }
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelPurchaseReturnDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
