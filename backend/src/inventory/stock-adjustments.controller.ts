import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { ProposeStockAdjustmentDto, RejectStockAdjustmentDto } from './dto/stock-adjustment.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/stock/adjustments')
@RedactFields(REDACT.STOCK_VALUE)
export class StockAdjustmentsController {
  constructor(private readonly service: StockAdjustmentsService) {}

  @RequirePermissions(PERMISSIONS.STOCK_ADJUST_PROPOSE)
  @Get()
  list() {
    return this.service.listEnriched();
  }

  @RequirePermissions(PERMISSIONS.STOCK_ADJUST_PROPOSE)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @RequirePermissions(PERMISSIONS.STOCK_ADJUST_PROPOSE)
  @Idempotent()
  @Post()
  async propose(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(ProposeStockAdjustmentDto, body);
    return this.service.propose(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.STOCK_ADJUST_APPROVE)
  @Idempotent()
  @Post(':id/approve')
  approve(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.approve(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.STOCK_ADJUST_APPROVE)
  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(RejectStockAdjustmentDto, body);
    return this.service.reject(id, actor.id, dto.reason);
  }
}
