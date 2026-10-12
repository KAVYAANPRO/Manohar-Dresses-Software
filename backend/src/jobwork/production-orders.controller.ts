import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import { CancelProductionOrderDto, CreateProductionOrderDto } from './dto/production-order.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/production-orders')
export class ProductionOrdersController {
  constructor(private readonly service: ProductionOrdersService) {}

  @RequirePermissions(PERMISSIONS.PRODUCTION_VIEW)
  @Get()
  list(@Query('designId') designId?: string, @Query('status') status?: string) {
    const filter: Record<string, unknown> = {};
    if (designId) filter.designId = designId;
    if (status) filter.status = status;
    return this.service.listWithStock(filter);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTION_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findByIdWithStock(id);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTION_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateProductionOrderDto, body);
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PRODUCTION_EDIT)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelProductionOrderDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
