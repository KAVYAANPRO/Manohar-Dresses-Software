import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductionOrder, ProductionOrderSchema } from './schemas/production-order.schema';
import { JobSlip, JobSlipSchema } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineSchema } from './schemas/job-material-line.schema';
import { MaterialIssue, MaterialIssueSchema } from './schemas/material-issue.schema';
import { MaterialReturn, MaterialReturnSchema } from './schemas/material-return.schema';
import { JobReceipt, JobReceiptSchema } from './schemas/job-receipt.schema';
import { JobCharge, JobChargeSchema } from './schemas/job-charge.schema';
import { JobWorkerPayment, JobWorkerPaymentSchema } from './schemas/job-worker-payment.schema';
import { KhataService } from './khata.service';
import { KhataController } from './khata.controller';
import { ProductionLookupsController } from './production-lookups.controller';
import { ProductionLookupsService } from './production-lookups.service';
import { ProductionOrdersService } from './production-orders.service';
import { ProductionOrdersController } from './production-orders.controller';
import { JobSlipsService } from './job-slips.service';
import { JobSlipStockCheckService } from './job-slip-stock-check.service';
import { JobSlipsController } from './job-slips.controller';
import { MaterialIssuesService } from './material-issues.service';
import { MaterialIssuesController } from './material-issues.controller';
import { MaterialReturnsService } from './material-returns.service';
import { MaterialReturnsController } from './material-returns.controller';
import { JobReceiptsService } from './job-receipts.service';
import { JobReceiptsController, JobComparisonController, ShortageTolerancesController } from './job-receipts.controller';
import { PortalJobsController } from './portal-jobs.controller';
import { DesignModule } from '../design/design.module';
import { MasterModule } from '../master/master.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CommonModule } from '../common/common.module';
import { CostingModule } from '../costing/costing.module';
import { JobworkLookupService } from './jobwork-lookup.service';
import { MaterialJobSlipsService } from './material-job-slips.service';
import { MaterialJobSlipsController } from './material-job-slips.controller';
import { ProcessingBatchService } from './processing-batch.service';
import { ProcessingBatchController } from './processing-batch.controller';
import { ShortageTolerance, ShortageToleranceSchema } from './schemas/shortage-tolerance.schema';
import { JobReconciliationService } from './job-reconciliation.service';
import { ProcessingJobsService } from './processing-jobs.service';
import { ProcessingJobsController } from './processing-jobs.controller';
import { ShortageTolerancesService } from './shortage-tolerances.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProductionOrder.name, schema: ProductionOrderSchema },
      { name: JobSlip.name, schema: JobSlipSchema },
      { name: JobMaterialLine.name, schema: JobMaterialLineSchema },
      { name: MaterialIssue.name, schema: MaterialIssueSchema },
      { name: MaterialReturn.name, schema: MaterialReturnSchema },
      { name: JobReceipt.name, schema: JobReceiptSchema },
      { name: JobCharge.name, schema: JobChargeSchema },
      { name: JobWorkerPayment.name, schema: JobWorkerPaymentSchema },
      { name: ShortageTolerance.name, schema: ShortageToleranceSchema },
    ]),
    DesignModule,
    MasterModule,
    InventoryModule,
    CommonModule,
    forwardRef(() => CostingModule),
  ],
  controllers: [
    MaterialJobSlipsController,
    ProcessingBatchController,
    ProductionOrdersController,
    JobSlipsController,
    MaterialIssuesController,
    MaterialReturnsController,
    JobReceiptsController,
    JobComparisonController,
    PortalJobsController,
    KhataController,
    ProductionLookupsController,
    ProcessingJobsController,
    ShortageTolerancesController,
  ],
  providers: [
    ProductionOrdersService,
    JobSlipsService,
    JobSlipStockCheckService,
    MaterialIssuesService,
    MaterialReturnsService,
    JobReceiptsService,
    KhataService,
    ProductionLookupsService,
    JobworkLookupService,
    MaterialJobSlipsService,
    ProcessingBatchService,
    JobReconciliationService,
    ProcessingJobsService,
    ShortageTolerancesService,
  ],
  exports: [ProductionOrdersService, JobSlipsService, JobworkLookupService, MongooseModule],
})
export class JobworkModule {}
