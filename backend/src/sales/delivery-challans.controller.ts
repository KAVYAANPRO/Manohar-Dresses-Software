import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DeliveryChallansService } from './delivery-challans.service';
import {
  CancelChallanDto,
  ChallanInvoiceDto,
  ChallanReturnDto,
  CreateDeliveryChallanDto,
} from './dto/delivery-challan.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

/** Customer delivery challans. Order permissions for the document, invoice permissions to bill it. */
@Controller('api/v1/delivery-challans')
@RedactFields(REDACT.SALES_RATES, REDACT.STOCK_VALUE)
export class DeliveryChallansController {
  constructor(private readonly service: DeliveryChallansService) {}

  @RequirePermissions(PERMISSIONS.SALES_ORDER_VIEW)
  @Get()
  list(@Query('customerId') customerId?: string, @Query('status') status?: string) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (status) filter.status = { $in: status.split(',') };
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.view(id);
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateDeliveryChallanDto, body);
    if (dto.dispatch && !actor.permissions.has(PERMISSIONS.SALES_ORDER_CONFIRM)) dto.dispatch = false;
    return this.service.create(dto, { id: actor.id, permissions: actor.permissions });
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_CONFIRM)
  @Idempotent()
  @Post(':id/dispatch')
  dispatch(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.dispatch(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_EDIT)
  @Idempotent()
  @Post(':id/return')
  async returnGoods(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(ChallanReturnDto, body);
    return this.service.returnGoods(id, dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_EDIT)
  @Idempotent()
  @Post(':id/invoice')
  async invoice(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(ChallanInvoiceDto, body);
    if (dto.confirm && !actor.permissions.has(PERMISSIONS.SALES_INVOICE_CONFIRM)) dto.confirm = false;
    return this.service.invoice(id, dto, { id: actor.id, permissions: actor.permissions });
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_CANCEL)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CancelChallanDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
