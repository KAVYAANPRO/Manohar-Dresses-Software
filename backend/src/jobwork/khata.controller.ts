import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { KhataService } from './khata.service';
import { CancelJobWorkerPaymentDto, CreateJobWorkerPaymentDto } from './dto/job-worker-payment.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';

/** Karigar Khata Book: job-work charges earned vs advances/payments, per factory or artisan. */
@Controller('api/v1/khata')
export class KhataController {
  constructor(private readonly service: KhataService) {}

  @RequirePermissions(PERMISSIONS.JOBWORK_PAYMENT_VIEW)
  @Get('summary')
  summary(@Query('type') type?: string) {
    return this.service.summary(type);
  }

  @RequirePermissions(PERMISSIONS.JOBWORK_PAYMENT_VIEW)
  @Get('payments')
  listPayments(@Query('jobWorkerId') jobWorkerId?: string, @Query('status') status?: string) {
    return this.service.listPayments({ jobWorkerId, status });
  }

  @RequirePermissions(PERMISSIONS.JOBWORK_PAYMENT_RECORD)
  @Idempotent()
  @Post('payments')
  async createPayment(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateJobWorkerPaymentDto, body);
    return this.service.createPayment(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBWORK_PAYMENT_RECORD)
  @Post('payments/:id/cancel')
  async cancelPayment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelJobWorkerPaymentDto, body);
    return this.service.cancelPayment(id, dto.reason, actor.id);
  }

  @RequirePermissions(PERMISSIONS.JOBWORK_PAYMENT_VIEW)
  @Get(':jobWorkerId/ledger')
  ledger(@Param('jobWorkerId') jobWorkerId: string) {
    return this.service.ledger(jobWorkerId);
  }
}
