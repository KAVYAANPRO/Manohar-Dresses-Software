import { Controller, Get, Param, Query } from '@nestjs/common';
import { CostingService } from './costing.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';

/** CST-06, CST-07: every response here requires costing.view - "grantable per user", no default role has it except Super Admin. */
@Controller('api/v1')
export class CostingController {
  constructor(private readonly service: CostingService) {}

  @RequirePermissions(PERMISSIONS.COSTING_VIEW)
  @Get('job-slips/:id/cost-sheet')
  getCostSheet(@Param('id') id: string) {
    return this.service.getCostSheet(id);
  }

  /** ?jobType=MANUFACTURING|PROCESSING ?status=PROVISIONAL|FINAL ?designId=… */
  @RequirePermissions(PERMISSIONS.COSTING_VIEW)
  @Get('costing/cost-sheets')
  list(
    @Query('jobType') jobType?: string,
    @Query('status') status?: string,
    @Query('designId') designId?: string,
  ) {
    return this.service.listCostSheets({ jobType, status, designId });
  }

  /** :id is the job slip id. */
  @RequirePermissions(PERMISSIONS.COSTING_VIEW)
  @Get('costing/cost-sheets/:id')
  detail(@Param('id') id: string) {
    return this.service.getCostSheetDetail(id);
  }

  @RequirePermissions(PERMISSIONS.COSTING_VIEW)
  @Get('costing/designs/:id')
  getMarginsForDesign(@Param('id') id: string) {
    return this.service.getMarginsForDesign(id);
  }
}
