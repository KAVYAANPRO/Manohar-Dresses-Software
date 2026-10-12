import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';

/**
 * The warehouse, quarantine, and five virtual locations (tech.md §4.3) are structural
 * infrastructure the stock engine cannot function without - BR-01 alone requires
 * VIRT-SUPPLIER to exist before a single inward can post. These are NOT optional demo data,
 * so they are provisioned here, automatically, on every boot (idempotent upsert), rather than
 * depending on someone having run `npm run seed` first. The seed script also creates them
 * (for a fully-seeded demo dataset in one command) but this is the guarantee that actually
 * matters for a fresh production database.
 */
@Injectable()
export class BootstrapLocationsService implements OnModuleInit {
  private readonly logger = new Logger(BootstrapLocationsService.name);

  private readonly fixedLocations: Array<{ code: string; name: string; kind: string }> = [
    { code: 'MAIN-WH', name: 'Main Warehouse', kind: 'WAREHOUSE' },
    { code: 'QUARANTINE', name: 'Quarantine', kind: 'QUARANTINE' },
    { code: 'CUST-CONSIGN', name: 'With customers (delivery challan)', kind: 'CUSTOMER_CONSIGNMENT' },
    { code: 'VIRT-SUPPLIER', name: 'Supplier (virtual)', kind: 'VIRTUAL_SUPPLIER' },
    { code: 'VIRT-CUSTOMER', name: 'Customer (virtual)', kind: 'VIRTUAL_CUSTOMER' },
    { code: 'VIRT-PRODUCTION', name: 'Production (virtual)', kind: 'VIRTUAL_PRODUCTION' },
    { code: 'VIRT-LOSS', name: 'Loss (virtual)', kind: 'VIRTUAL_LOSS' },
    { code: 'VIRT-ADJUSTMENT', name: 'Adjustment (virtual)', kind: 'VIRTUAL_ADJUSTMENT' },
  ];

  constructor(
    @InjectModel(StockLocation.name) private readonly model: Model<StockLocationDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const loc of this.fixedLocations) {
      await this.model.updateOne({ code: loc.code }, { $setOnInsert: loc }, { upsert: true });
    }
    this.logger.log('Fixed and virtual stock locations verified.');
  }
}
