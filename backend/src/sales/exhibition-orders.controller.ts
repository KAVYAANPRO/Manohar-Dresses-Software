import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ExhibitionOrdersService } from './exhibition-orders.service';
import {
  CancelExhibitionOrderDto,
  ConvertExhibitionOrderDto,
  CreateExhibitionOrderDto,
} from './dto/exhibition-order.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { ForbiddenProblemException } from '../common/errors/problem.exception';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/exhibition-orders')
@RedactFields(REDACT.SALES_RATES, REDACT.STOCK_VALUE)
export class ExhibitionOrdersController {
  constructor(private readonly service: ExhibitionOrdersService) {}

  @RequirePermissions(PERMISSIONS.SALES_ORDER_VIEW)
  @Get()
  list(@Query('status') status?: string) {
    return this.service.list(status ? { status } : {});
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
    const dto = await validateDto(CreateExhibitionOrderDto, body);
    return this.service.create(dto, actor.id);
  }

  /** target=SALES_ORDER needs order confirm; target=INVOICE needs invoice confirm (+ payment record for the advance). */
  @RequirePermissions(PERMISSIONS.SALES_ORDER_CONFIRM)
  @Idempotent()
  @Post(':id/convert')
  async convert(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(ConvertExhibitionOrderDto, body);
    if (dto.target === 'INVOICE' && !actor.permissions.has(PERMISSIONS.SALES_INVOICE_CONFIRM)) {
      throw new ForbiddenProblemException('Converting straight to an invoice needs the sales.invoice.confirm permission.');
    }
    return this.service.convert(id, dto, { id: actor.id, permissions: actor.permissions });
  }

  @RequirePermissions(PERMISSIONS.SALES_ORDER_CANCEL)
  @Post(':id/cancel')
  async cancel(@Param('id') id: string, @Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CancelExhibitionOrderDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }
}
