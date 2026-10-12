import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JobCostSheet, JobCostSheetSchema } from './schemas/job-cost-sheet.schema';
import { LotRevaluation, LotRevaluationSchema } from './schemas/lot-revaluation.schema';
import { CostingService } from './costing.service';
import { CostingController } from './costing.controller';
import { JobworkModule } from '../jobwork/jobwork.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MasterModule } from '../master/master.module';

/**
 * Depends on JobworkModule (job_slips, job_material_lines, job_charges, job_receipts) and
 * JobworkModule depends back on this module (JobSlipsService.close() calls
 * CostingService.onJobClosed) - a genuine, tech.md-sanctioned circular relationship
 * ("costing... calls back into" the module that triggers it), resolved with forwardRef()
 * on both sides rather than restructured away, since the two modules really do need each
 * other for this one call.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: JobCostSheet.name, schema: JobCostSheetSchema },
      { name: LotRevaluation.name, schema: LotRevaluationSchema },
    ]),
    forwardRef(() => JobworkModule),
    InventoryModule,
    MasterModule,
  ],
  controllers: [CostingController],
  providers: [CostingService],
  exports: [CostingService],
})
export class CostingModule {}
