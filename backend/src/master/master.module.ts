import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LotNumberSeries, LotNumberSeriesSchema } from './schemas/lot-number-series.schema';
import { LotNumbersService } from './lot-numbers.service';
import { LotNumbersController } from './lot-numbers.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { Supplier, SupplierSchema } from './schemas/supplier.schema';
import { Customer, CustomerSchema } from './schemas/customer.schema';
import { JobWorker, JobWorkerSchema } from './schemas/job-worker.schema';
import { MaterialCategory, MaterialCategorySchema } from './schemas/material-category.schema';
import { Colour, ColourSchema } from './schemas/colour.schema';
import {
  Material,
  MaterialSchema,
  MaterialVariant,
  MaterialVariantSchema,
} from './schemas/material.schema';
import { Uom, UomSchema, UomConversion, UomConversionSchema } from './schemas/uom.schema';
import { Size, SizeSchema } from './schemas/size.schema';
import { ProductCategory, ProductCategorySchema } from './schemas/product-category.schema';
import { ProcessingType, ProcessingTypeSchema } from './schemas/processing-type.schema';
import { StockLocation, StockLocationSchema } from './schemas/stock-location.schema';
import { TaxRule, TaxRuleSchema } from './schemas/tax-rule.schema';
import { CompanySettings, CompanySettingsSchema } from './schemas/company-settings.schema';

import { SuppliersService } from './suppliers.service';
import { SuppliersController } from './suppliers.controller';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { JobWorkersService } from './job-workers.service';
import { JobWorkersController } from './job-workers.controller';
import { MaterialCategoriesService } from './material-categories.service';
import { MaterialCategoriesController } from './material-categories.controller';
import { ColoursService } from './colours.service';
import { ColoursController } from './colours.controller';
import { MaterialsService } from './materials.service';
import { MaterialsController, MaterialVariantsController } from './materials.controller';
import { UomsService } from './uoms.service';
import { UomsController, MaterialUomConversionsController } from './uoms.controller';
import { SizesService } from './sizes.service';
import { SizesController } from './sizes.controller';
import { ProductCategoriesService } from './product-categories.service';
import { ProductCategoriesController } from './product-categories.controller';
import { ProcessingTypesService } from './processing-types.service';
import { ProcessingTypesController } from './processing-types.controller';
import { StockLocationsService } from './stock-locations.service';
import { StockLocationsController } from './stock-locations.controller';
import { TaxRulesService } from './tax-rules.service';
import { TaxRulesController } from './tax-rules.controller';
import { CompanySettingsService } from './company-settings.service';
import { CompanySettingsController } from './company-settings.controller';
import { NumberSeriesController } from './number-series.controller';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { ImportBatch, ImportBatchSchema } from './schemas/import-batch.schema';
import { SalesAgent, SalesAgentSchema } from './schemas/agent.schema';
import { AgentsService } from './agents.service';
import { AgentsController } from './agents.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Supplier.name, schema: SupplierSchema },
      { name: LotNumberSeries.name, schema: LotNumberSeriesSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: JobWorker.name, schema: JobWorkerSchema },
      { name: MaterialCategory.name, schema: MaterialCategorySchema },
      { name: Colour.name, schema: ColourSchema },
      { name: Material.name, schema: MaterialSchema },
      { name: MaterialVariant.name, schema: MaterialVariantSchema },
      { name: Uom.name, schema: UomSchema },
      { name: UomConversion.name, schema: UomConversionSchema },
      { name: Size.name, schema: SizeSchema },
      { name: ProductCategory.name, schema: ProductCategorySchema },
      { name: ProcessingType.name, schema: ProcessingTypeSchema },
      { name: StockLocation.name, schema: StockLocationSchema },
      { name: TaxRule.name, schema: TaxRuleSchema },
      { name: CompanySettings.name, schema: CompanySettingsSchema },
      { name: ImportBatch.name, schema: ImportBatchSchema },
      { name: SalesAgent.name, schema: SalesAgentSchema },
    ]),
    // MST-11's opening-stock import needs the stock engine; InventoryModule already imports
    // MasterModule (for StockLocation etc.), so this side needs forwardRef() to avoid a
    // circular require - the same pattern already used for CostingModule <-> JobworkModule.
    forwardRef(() => InventoryModule),
  ],
  controllers: [
    LotNumbersController,
    SuppliersController,
    CustomersController,
    JobWorkersController,
    MaterialCategoriesController,
    ColoursController,
    MaterialsController,
    MaterialVariantsController,
    UomsController,
    MaterialUomConversionsController,
    SizesController,
    ProductCategoriesController,
    ProcessingTypesController,
    StockLocationsController,
    TaxRulesController,
    CompanySettingsController,
    NumberSeriesController,
    ImportController,
    AgentsController,
  ],
  providers: [
    LotNumbersService,
    SuppliersService,
    CustomersService,
    JobWorkersService,
    MaterialCategoriesService,
    ColoursService,
    MaterialsService,
    UomsService,
    SizesService,
    ProductCategoriesService,
    ProcessingTypesService,
    StockLocationsService,
    TaxRulesService,
    CompanySettingsService,
    ImportService,
    AgentsService,
  ],
  exports: [
    LotNumbersService,
    SuppliersService,
    CustomersService,
    JobWorkersService,
    MaterialsService,
    UomsService,
    StockLocationsService,
    TaxRulesService,
    CompanySettingsService,
    AgentsService,
    // Re-exports every model registered above (Supplier, MaterialVariant, StockLocation, ...)
    // so other modules (inventory, purchasing) can @InjectModel them directly instead of
    // re-registering the same schema a second time.
    MongooseModule,
  ],
})
export class MasterModule {}
