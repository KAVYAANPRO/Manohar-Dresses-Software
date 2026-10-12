import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { TraceService } from './trace.service';
import { CreateInvoiceDto, CancelInvoiceDto, PreviewInvoiceDto } from './dto/invoice.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/invoices')
@RedactFields(REDACT.SALES_RATES, REDACT.STOCK_VALUE)
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly traceService: TraceService,
  ) {}

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_VIEW)
  @Get()
  list(
    @Query('customerId') customerId?: string,
    @Query('salesOrderId') salesOrderId?: string,
    @Query('status') status?: string,
    @Query('paymentStatus') paymentStatus?: string,
    @Query('agentId') agentId?: string,
  ) {
    const filter: Record<string, unknown> = {};
    if (customerId) filter.customerId = customerId;
    if (salesOrderId) filter.salesOrderId = salesOrderId;
    if (agentId) filter.agentId = agentId;
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    return this.service.list(filter);
  }

  /** Pricing preview (GST split, round-off) for unsaved lines; nothing is persisted. */
  @RequirePermissions(PERMISSIONS.SALES_ORDER_VIEW)
  @Post('preview')
  async preview(@Body() body: unknown) {
    const dto = await validateDto(PreviewInvoiceDto, body);
    return this.service.preview(dto);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.view(id);
  }

  @RequirePermissions(PERMISSIONS.COSTING_VIEW)
  @Get(':id/margin')
  margin(@Param('id') id: string) {
    return this.service.getMargin(id);
  }

  @RequirePermissions(PERMISSIONS.COSTING_VIEW)
  @Get('lines/:invoiceLineId/trace')
  trace(@Param('invoiceLineId') invoiceLineId: string) {
    return this.traceService.traceInvoiceLine(invoiceLineId);
  }

  /** Creates a DRAFT; with `confirm: true` it is confirmed in the same call (needs confirm permission). */
  @RequirePermissions(PERMISSIONS.SALES_INVOICE_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateInvoiceDto, body);
    if (dto.confirm && !actor.permissions.has(PERMISSIONS.SALES_INVOICE_CONFIRM)) {
      dto.confirm = false;
    }
    return this.service.create(dto, { id: actor.id, permissions: actor.permissions });
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_EDIT)
  @Post(':id/discard')
  discard(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.discardDraft(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelInvoiceDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
