import { Controller, Get, Query } from '@nestjs/common';
import { ReadyStockService, ReadyStockFilter } from './ready-stock.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';

function parseFilter(query: Record<string, string | undefined>): ReadyStockFilter {
  return {
    designId: query.designId,
    colourId: query.colourId,
    sizeId: query.sizeId,
    categoryId: query.categoryId,
  };
}

/** RGS-01 to RGS-04. PKG-02: cost/rate fields are stripped unless the caller also has stock.value.view. */
@Controller('api/v1/ready-stock')
@RedactFields(REDACT.DESIGN_RATE, REDACT.STOCK_VALUE)
export class ReadyStockController {
  constructor(private readonly service: ReadyStockService) {}

  @RequirePermissions(PERMISSIONS.READYSTOCK_VIEW)
  @Get('lots')
  lots(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.listLots(
      parseFilter(query),
      actor.permissions.has(PERMISSIONS.STOCK_VALUE_VIEW),
    );
  }

  /** Sellable-item picker (all variants, with on-hand / reserved / ATP / packed). */
  @RequirePermissions(PERMISSIONS.READYSTOCK_VIEW)
  @Get('items')
  items(@Query('designId') designId?: string, @Query('inStockOnly') inStockOnly?: string) {
    return this.service.sellableItems({ designId, inStockOnly: inStockOnly === 'true' });
  }

  @RequirePermissions(PERMISSIONS.READYSTOCK_VIEW)
  @Get('summary')
  summary(
    @Query() query: Record<string, string | undefined>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.summary(
      parseFilter(query),
      actor.permissions.has(PERMISSIONS.STOCK_VALUE_VIEW),
    );
  }
}
