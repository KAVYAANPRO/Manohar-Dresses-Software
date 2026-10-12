import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SalesReturnsService } from './sales-returns.service';
import { CancelSalesReturnDto, CreateSalesReturnDto } from './dto/sales-return.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

/** SAL-10 sales returns. Uses the invoice permissions: a return is an amendment of an invoice. */
@Controller('api/v1/sales-returns')
@RedactFields(REDACT.SALES_RATES, REDACT.STOCK_VALUE)
export class SalesReturnsController {
  constructor(private readonly service: SalesReturnsService) {}

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_VIEW)
  @Get()
  list(@Query('customerId') customerId?: string, @Query('invoiceId') invoiceId?: string) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (invoiceId) filter.invoiceId = invoiceId;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.view(id);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateSalesReturnDto, body);
    if (dto.confirm && !actor.permissions.has(PERMISSIONS.SALES_INVOICE_CONFIRM)) dto.confirm = false;
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_EDIT)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CancelSalesReturnDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}

@Controller('api/v1/credit-notes')
@RedactFields(REDACT.SALES_RATES, REDACT.STOCK_VALUE)
export class CreditNotesController {
  constructor(private readonly service: SalesReturnsService) {}

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_VIEW)
  @Get()
  list(@Query('customerId') customerId?: string, @Query('invoiceId') invoiceId?: string) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (invoiceId) filter.invoiceId = invoiceId;
    return this.service.creditNotes(filter);
  }
}
