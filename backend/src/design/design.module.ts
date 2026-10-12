import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Design, DesignSchema } from './schemas/design.schema';
import { DesignVariant, DesignVariantSchema } from './schemas/design-variant.schema';
import { DesignBomVersion, DesignBomVersionSchema } from './schemas/design-bom-version.schema';
import { DesignRateHistory, DesignRateHistorySchema } from './schemas/design-rate-history.schema';
import { DesignsService } from './designs.service';
import { DesignsController } from './designs.controller';
import { MaterialStockInfoService } from './material-stock-info.service';
import { MasterModule } from '../master/master.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CatalogItem, CatalogItemSchema } from './catalog/catalog-item.schema';
import { CatalogService } from './catalog/catalog.service';
import { CatalogController } from './catalog/catalog.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Design.name, schema: DesignSchema },
      { name: DesignVariant.name, schema: DesignVariantSchema },
      { name: DesignBomVersion.name, schema: DesignBomVersionSchema },
      { name: DesignRateHistory.name, schema: DesignRateHistorySchema },
      { name: CatalogItem.name, schema: CatalogItemSchema },
    ]),
    InventoryModule,
    MasterModule,
    UploadsModule,
  ],
  controllers: [DesignsController, CatalogController],
  providers: [DesignsService, MaterialStockInfoService, CatalogService],
  exports: [DesignsService, MaterialStockInfoService, CatalogService, MongooseModule],
})
export class DesignModule {}
