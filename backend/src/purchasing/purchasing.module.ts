import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Purchase, PurchaseSchema } from './schemas/purchase.schema';
import { Inward, InwardSchema } from './schemas/inward.schema';
import { PurchaseReturn, PurchaseReturnSchema } from './schemas/purchase-return.schema';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { InwardsService } from './inwards.service';
import { InwardsController } from './inwards.controller';
import { PurchaseReturnsService } from './purchase-returns.service';
import { PurchaseReturnsController } from './purchase-returns.controller';
import { MasterModule } from '../master/master.module';
import { InventoryModule } from '../inventory/inventory.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Purchase.name, schema: PurchaseSchema },
      { name: Inward.name, schema: InwardSchema },
      { name: PurchaseReturn.name, schema: PurchaseReturnSchema },
    ]),
    MasterModule,
    InventoryModule,
    UploadsModule,
  ],
  controllers: [PurchasesController, InwardsController, PurchaseReturnsController],
  providers: [PurchasesService, InwardsService, PurchaseReturnsService],
  exports: [PurchasesService, InwardsService, PurchaseReturnsService, MongooseModule],
})
export class PurchasingModule {}
