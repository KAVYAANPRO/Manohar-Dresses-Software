import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { JobWorkChallanService } from './job-work-challan.service';
import { InventoryModule } from '../inventory/inventory.module';
import { SalesModule } from '../sales/sales.module';
import { JobworkModule } from '../jobwork/jobwork.module';
import { MasterModule } from '../master/master.module';
import { DesignModule } from '../design/design.module';

@Module({
  imports: [SalesModule, JobworkModule, MasterModule, DesignModule, InventoryModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, JobWorkChallanService],
})
export class DocumentsModule {}
