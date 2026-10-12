import { Controller, ForbiddenException, Get } from '@nestjs/common';
import { DashboardsService } from './dashboards.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';

/** prd.md §6.1 Factory/Artisan dashboard: "own data only" - portal-scoped, never the admin route. */
@Controller('portal/v1/dashboard')
export class PortalDashboardController {
  constructor(private readonly service: DashboardsService) {}

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_VIEW)
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser) {
    if (!user.jobWorkerId) throw new ForbiddenException();
    return this.service.factoryArtisan(user.jobWorkerId);
  }
}
