import { Module } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { DashboardsController } from './dashboards.controller';
import { PortalDashboardController } from './portal-dashboard.controller';
import { JobworkModule } from '../jobwork/jobwork.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { SalesModule } from '../sales/sales.module';
import { DesignModule } from '../design/design.module';
import { MasterModule } from '../master/master.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ReadystockModule } from '../readystock/readystock.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    JobworkModule,
    PurchasingModule,
    SalesModule,
    DesignModule,
    MasterModule,
    InventoryModule,
    ReadystockModule,
    ReportsModule,
  ],
  controllers: [DashboardsController, PortalDashboardController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
