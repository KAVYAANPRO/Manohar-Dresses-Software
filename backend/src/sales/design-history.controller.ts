import { Controller, Get, Param } from '@nestjs/common';
import { DesignHistoryService } from './design-history.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';

/** TRC-02. Cost/margin figures require costing.view; purchase rates require purchase.rates.view - both stripped otherwise, same redaction-by-omission pattern as ready-stock. */
@Controller('api/v1/designs')
export class DesignHistoryController {
  constructor(private readonly service: DesignHistoryService) {}

  @RequirePermissions(PERMISSIONS.DESIGN_VIEW)
  @Get(':id/history')
  history(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.getHistory(
      id,
      actor.permissions.has(PERMISSIONS.COSTING_VIEW),
      actor.permissions.has(PERMISSIONS.PURCHASE_RATES_VIEW),
    );
  }
}
