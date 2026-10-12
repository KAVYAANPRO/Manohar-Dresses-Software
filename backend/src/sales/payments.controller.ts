import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AllocatePaymentDto, RecordPaymentDto } from './dto/payment.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @RequirePermissions(PERMISSIONS.PAYMENT_VIEW)
  @Get()
  list(@Query('customerId') customerId?: string) {
    return this.service.list(customerId ? { customerId } : {});
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_VIEW)
  @Get('pending-invoices')
  pending(@Query('customerId') customerId?: string) {
    return this.service.pendingInvoices(customerId);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @Idempotent()
  @Post()
  async record(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(RecordPaymentDto, body);
    return this.service.record(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @Post(':paymentId/allocations')
  async allocate(@Param('paymentId') paymentId: string, @Body() body: unknown) {
    const dto = await validateDto(AllocatePaymentDto, body);
    return this.service.allocate(paymentId, dto);
  }

  @RequirePermissions(PERMISSIONS.PAYMENT_RECORD)
  @Delete(':paymentId/allocations/:invoiceId')
  unallocate(@Param('paymentId') paymentId: string, @Param('invoiceId') invoiceId: string) {
    return this.service.unallocate(paymentId, invoiceId);
  }
}
