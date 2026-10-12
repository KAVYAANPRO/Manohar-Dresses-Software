import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ProcessingBatchService, CreateProcessingBatchDto, ReceiveProcessingBatchDto } from './processing-batch.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';
import { REDACT, RedactFields } from '../common/redaction/redaction';

/** Processing job sheets: lot thans out to a processor in several colours, back than by than. */
@RedactFields(REDACT.JOBWORK_MONEY, REDACT.STOCK_VALUE)
@Controller('api/v1/processing-batches')
export class ProcessingBatchController {
  constructor(private readonly service: ProcessingBatchService) {}

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  /** Creates the processing job and issues the fabric to the processor immediately. */
  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT, PERMISSIONS.ISSUE_EDIT, PERMISSIONS.ISSUE_CONFIRM)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(await validateDto(CreateProcessingBatchDto, body), actor.id);
  }

  /** Receive thans back (with shrinkage); each colour becomes processed stock in the main warehouse. */
  @RequirePermissions(PERMISSIONS.RECEIPT_EDIT, PERMISSIONS.RECEIPT_CONFIRM)
  @Idempotent()
  @Post(':id/receive')
  async receive(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.receive(id, await validateDto(ReceiveProcessingBatchDto, body), actor.id);
  }
}
