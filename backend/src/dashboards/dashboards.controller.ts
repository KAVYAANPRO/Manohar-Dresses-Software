import { Controller, Get, Query } from '@nestjs/common';
import { DashboardsService, parseRange } from './dashboards.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS, dashboardPermission } from '../identity/permissions.catalogue';

/**
 * DSH-01, prd.md §6.1: the internal-user dashboards. The Factory/Artisan one is portal-only
 * (see portal-dashboard.controller.ts). All accept ?from=&to= (YYYY-MM-DD) for flow KPIs.
 * The production home has no dedicated dashboard.* key in the catalogue, so it is gated by
 * production.view, which the Production role already holds.
 */
@Controller('api/v1/dashboards')
export class DashboardsController {
  constructor(private readonly service: DashboardsService) {}

  @RequirePermissions(dashboardPermission('admin'))
  @Get('admin')
  admin(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.admin(user, parseRange(from, to));
  }

  @RequirePermissions(dashboardPermission('purchase'))
  @Get('purchase')
  purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.purchase(user, parseRange(from, to));
  }

  @RequirePermissions(dashboardPermission('raw_material'))
  @Get('raw-material')
  rawMaterial(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.rawMaterial(user, parseRange(from, to));
  }

  @RequirePermissions(dashboardPermission('design'))
  @Get('design')
  design(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.design(parseRange(from, to));
  }

  @RequirePermissions(PERMISSIONS.PRODUCTION_VIEW)
  @Get('production')
  production(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.production(user, parseRange(from, to));
  }

  @RequirePermissions(dashboardPermission('packing'))
  @Get('packing')
  packing() {
    return this.service.packing();
  }

  @RequirePermissions(dashboardPermission('sales'))
  @Get('sales')
  sales(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.sales(user, parseRange(from, to));
  }
}
