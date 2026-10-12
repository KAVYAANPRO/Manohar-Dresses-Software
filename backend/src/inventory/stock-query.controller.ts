import { Controller, Get, Post, Query } from '@nestjs/common';
import { StockQueryService } from './stock-query.service';
import { StockService } from './stock.service';
import { StockItemsService } from './stock-items.service';
import { ReconciliationService } from './reconciliation.service';
import { StockViewsService } from './stock-views.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';

@Controller('api/v1/stock')
@RedactFields(REDACT.STOCK_VALUE)
export class StockQueryController {
  constructor(
    private readonly queryService: StockQueryService,
    private readonly stockService: StockService,
    private readonly stockItemsService: StockItemsService,
    private readonly reconciliationService: ReconciliationService,
    private readonly viewsService: StockViewsService,
  ) {}

  /** STK-04/08: balances per lot x physical location with names, plus per-item totals and low-stock flags. */
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('overview')
  overview(
    @Query('kind') kind?: string,
    @Query('stockItemId') stockItemId?: string,
    @Query('locationId') locationId?: string,
  ) {
    return this.viewsService.overview({ kind, stockItemId, locationId });
  }

  /** STK-01: ledger rows with item / lot / location / user / document names; all filters optional. */
  @RequirePermissions(PERMISSIONS.STOCK_LEDGER_VIEW)
  @Get('ledger/entries')
  ledgerEntries(@Query() q: Record<string, string>) {
    return this.viewsService.ledger({
      stockItemId: q.stockItemId,
      lotId: q.lotId,
      locationId: q.locationId,
      docType: q.docType,
      docId: q.docId,
      movementType: q.movementType,
      from: q.from,
      to: q.to,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      skip: q.skip ? parseInt(q.skip, 10) : undefined,
    });
  }

  /** STK-07: lots with origin, supplier, received vs remaining quantity and where it is. */
  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('lots/details')
  lotDetails(@Query('stockItemId') stockItemId?: string, @Query('kind') kind?: string) {
    return this.viewsService.lots({ stockItemId, kind });
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('items')
  listItems(@Query('kind') kind?: string) {
    return this.stockItemsService.list(kind ? { kind } : {});
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('balances')
  balances(@Query('stockItemId') stockItemId?: string, @Query('locationId') locationId?: string) {
    return this.queryService.balances({ stockItemId, locationId });
  }

  @RequirePermissions(PERMISSIONS.STOCK_LEDGER_VIEW)
  @Get('ledger')
  ledger(@Query('stockItemId') stockItemId: string, @Query('limit') limit?: string) {
    return this.stockService.ledgerForItem(stockItemId, limit ? parseInt(limit, 10) : undefined);
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('lots')
  lots(@Query('stockItemId') stockItemId?: string) {
    return this.queryService.lots({ stockItemId });
  }

  @RequirePermissions(PERMISSIONS.STOCK_VALUE_VIEW)
  @Get('valuation')
  valuation(@Query('stockItemId') stockItemId?: string) {
    return this.queryService.valuation({ stockItemId });
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('availability')
  availability(@Query('stockItemIds') stockItemIds: string) {
    const ids = stockItemIds
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return this.stockService.availability(ids);
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('low-stock')
  lowStock() {
    return this.queryService.lowStock();
  }

  @RequirePermissions(PERMISSIONS.STOCK_VIEW)
  @Get('reconciliation')
  reconciliationHistory() {
    return this.reconciliationService.latest();
  }

  /** Manual trigger for the nightly reconciliation job (STK-10), for ops and for tests. */
  @RequirePermissions(PERMISSIONS.STOCK_ADJUST_APPROVE)
  @Post('reconciliation/run')
  runReconciliation() {
    return this.reconciliationService.run();
  }
}
