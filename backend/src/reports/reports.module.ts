import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { InventoryModule } from '../inventory/inventory.module';
import { JobworkModule } from '../jobwork/jobwork.module';
import { SalesModule } from '../sales/sales.module';
import { DesignModule } from '../design/design.module';
import { CostingModule } from '../costing/costing.module';
import { MasterModule } from '../master/master.module';
import { LabelResolverService } from './label-resolver.service';
import { ReportLabelsInterceptor } from './report-labels.interceptor';
import { AlertRead, AlertReadSchema } from './alerts/alert-read.schema';
import { AlertsService } from './alerts/alerts.service';
import { InsightsService } from './alerts/insights.service';
import { AlertsController } from './alerts/alerts.controller';
import { TraceSearchService } from './trace-search.service';
import { TraceSearchController } from './trace-search.controller';

@Module({
  imports: [
    PurchasingModule,
    InventoryModule,
    JobworkModule,
    SalesModule,
    DesignModule,
    CostingModule,
    MasterModule,
    MongooseModule.forFeature([{ name: AlertRead.name, schema: AlertReadSchema }]),
  ],
  controllers: [ReportsController, AlertsController, TraceSearchController],
  providers: [
    ReportsService,
    LabelResolverService,
    ReportLabelsInterceptor,
    AlertsService,
    InsightsService,
    TraceSearchService,
  ],
  exports: [LabelResolverService, AlertsService, InsightsService],
})
export class ReportsModule {}
