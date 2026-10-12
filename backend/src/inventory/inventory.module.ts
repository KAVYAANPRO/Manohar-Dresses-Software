import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StockItem, StockItemSchema } from './schemas/stock-item.schema';
import { StockLot, StockLotSchema } from './schemas/stock-lot.schema';
import { StockLedgerEntry, StockLedgerSchema } from './schemas/stock-ledger.schema';
import { StockBalance, StockBalanceSchema } from './schemas/stock-balance.schema';
import { StockAdjustment, StockAdjustmentSchema } from './schemas/stock-adjustment.schema';
import { ReconRun, ReconRunSchema } from './schemas/recon-run.schema';
import { StockService } from './stock.service';
import { StockItemsService } from './stock-items.service';
import { StockQueryService } from './stock-query.service';
import { StockQueryController } from './stock-query.controller';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';
import { ReconciliationService } from './reconciliation.service';
import { StockViewsService } from './stock-views.service';
import { BootstrapLocationsService } from './bootstrap-locations.service';
import { MasterModule } from '../master/master.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockItem.name, schema: StockItemSchema },
      { name: StockLot.name, schema: StockLotSchema },
      { name: StockLedgerEntry.name, schema: StockLedgerSchema },
      { name: StockBalance.name, schema: StockBalanceSchema },
      { name: StockAdjustment.name, schema: StockAdjustmentSchema },
      { name: ReconRun.name, schema: ReconRunSchema },
    ]),
    forwardRef(() => MasterModule),
  ],
  controllers: [StockQueryController, StockAdjustmentsController],
  providers: [
    StockService,
    StockItemsService,
    StockQueryService,
    StockAdjustmentsService,
    ReconciliationService,
    BootstrapLocationsService,
    StockViewsService,
  ],
  exports: [
    StockService,
    StockItemsService,
    StockQueryService,
    ReconciliationService,
    StockViewsService,
    // Re-exports every model registered above (StockItem, StockLot, StockLedgerEntry, ...) so
    // other modules (jobwork) can @InjectModel them directly - the same fix MasterModule
    // needed in Phase 2 when StockService itself needed StockLocationModel.
    MongooseModule,
  ],
})
export class InventoryModule {}
