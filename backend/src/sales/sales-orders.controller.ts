import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto, CancelSalesOrderDto } from './dto/sales-order.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/sales-orders')
@RedactFields(REDACT.SALES_RATES, REDACT.STOCK_VALUE)
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  @RequirePermissions(PERMISSIONS.SALES_ORDER_VIEW)
  @Get()
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (status) filter.status = { $in: status.split(',') };
    return this.service.listView(filter);
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.view(id);
  }

  /** Creates a DRAFT; with `confirm: true` it is ATP-checked and confirmed in the same call. */
  @RequirePermissions(PERMISSIONS.SALES_ORDER_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateSalesOrderDto, body);
    if (dto.confirm && !actor.permissions.has(PERMISSIONS.SALES_ORDER_CONFIRM)) {
      dto.confirm = false;
    }
    return this.service.create(dto, { id: actor.id, permissions: actor.permissions });
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelSalesOrderDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
