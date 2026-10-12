import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PackingRecord, PackingRecordSchema } from './schemas/packing-record.schema';
import { InventoryModule } from '../inventory/inventory.module';
import { ReadyStockService } from './ready-stock.service';
import { ReadyStockController } from './ready-stock.controller';
import { PackingService } from './packing.service';
import { PackingController } from './packing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: PackingRecord.name, schema: PackingRecordSchema }]),
    InventoryModule,
  ],
  controllers: [ReadyStockController, PackingController],
  providers: [ReadyStockService, PackingService],
  exports: [ReadyStockService, PackingService, MongooseModule],
})
export class ReadystockModule {}
