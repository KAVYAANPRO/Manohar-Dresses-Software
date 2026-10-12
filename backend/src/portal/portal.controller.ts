import { Controller, ForbiddenException, Get, Param } from '@nestjs/common';
import { JobWorkersService } from '../master/job-workers.service';
import { PartyScopeService } from '../common/services/party-scope.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { RequestContextStore } from '../common/context/request-context';
import { PERMISSIONS } from '../identity/permissions.catalogue';

/**
 * The factory/artisan-facing surface (tech.md §10.1, §15.3). Only its `/me` and
 * `/job-workers/:id` routes exist in Phase 1, as a working demonstration of party isolation
 * (plan.md Phase 1 exit criterion: "A factory user ... sees exactly one job-worker row").
 * Job, material, and dispatch endpoints are built in Phase 4 alongside the rest of jobwork.
 *
 * NOTE on tech.md §10.1: the full design puts the portal on its own route prefix, cookie, and
 * least-privilege database role (three separate hardening layers). This pass shares the admin
 * session mechanism (one cookie, app-layer scoping only) and relies solely on
 * PartyScopeService + the party/internal check below - documented as the "Phase 1 now, Phase 4
 * hardening" fallback tech.md's own §9.3 allows for the RLS-equivalent layer.
 */
@Controller('portal/v1')
export class PortalController {
  constructor(
    private readonly jobWorkersService: JobWorkersService,
    private readonly partyScope: PartyScopeService,
  ) {}

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_VIEW)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    this.assertPartyPrincipal(user);
    return this.jobWorkersService.findById(user.jobWorkerId!);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_VIEW)
  @Get('job-workers/:id')
  async getJobWorker(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertPartyPrincipal(user);
    const ctx = RequestContextStore.getOrThrow();
    // Throws NOT_FOUND (not FORBIDDEN) for another party's id - tech.md §9.3 layer 1.
    this.partyScope.assertOwnParty(id, ctx);
    return this.jobWorkersService.findById(id);
  }

  private assertPartyPrincipal(user: AuthenticatedUser): void {
    if (user.principal !== 'party') {
      throw new ForbiddenException('The portal surface is for factory/artisan accounts only.');
    }
  }
}
