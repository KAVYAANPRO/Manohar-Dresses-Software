import { Body, Get, Headers, Param, Patch, Post, Query, Type, mixin } from '@nestjs/common';
import { MasterCrudService } from '../services/master-crud.service';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Idempotent } from '../decorators/idempotent.decorator';
import { AuthenticatedUser } from '../types/authenticated-request';
import { validateDto } from '../utils/validate-dto';

export interface MasterCrudControllerOptions {
  viewPermission: string;
  editPermission: string;
  createDto: new () => object;
  updateDto: new () => object;
}

/**
 * Generates the standard list/get/create/update/deactivate/reactivate route methods (tech.md
 * §10.3's "CRUD /suppliers, /customers, ..." shorthand) so each of the ~12 master-data
 * entities does not hand-write the same six routes. DTO validation is done explicitly via
 * validateDto() because the global ValidationPipe cannot infer a concrete DTO type through a
 * generic/mixin parameter signature (see common/utils/validate-dto.ts). Deliberately NOT
 * decorated with @Controller: the concrete subclass in each entity's own controller file adds
 * `@Controller('api/v1/<path>')` itself, which is the well-supported way to combine a
 * generated base class with Nest's controller discovery.
 */
export function MasterCrudController<TService extends MasterCrudService<unknown>>(
  options: MasterCrudControllerOptions,
): Type<{
  service: TService;
  list(query: Record<string, unknown>): Promise<unknown>;
  findOne(id: string): Promise<unknown>;
  create(body: unknown, actor: AuthenticatedUser): Promise<unknown>;
  update(id: string, body: unknown, actor: AuthenticatedUser, ifMatch?: string): Promise<unknown>;
  deactivate(id: string, actor: AuthenticatedUser): Promise<unknown>;
  reactivate(id: string, actor: AuthenticatedUser): Promise<unknown>;
}> {
  class BaseMasterController {
    constructor(public readonly service: TService) {}

    @RequirePermissions(options.viewPermission)
    @Get()
    list(@Query() query: Record<string, unknown>) {
      const filter: Record<string, unknown> = {};
      if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
      return this.service.list(filter);
    }

    @RequirePermissions(options.viewPermission)
    @Get(':id')
    findOne(@Param('id') id: string) {
      return this.service.findById(id);
    }

    @RequirePermissions(options.editPermission)
    @Idempotent()
    @Post()
    async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
      const dto = await validateDto(options.createDto, body);
      return this.service.create(dto as Partial<unknown>, actor.id);
    }

    @RequirePermissions(options.editPermission)
    @Patch(':id')
    async update(
      @Param('id') id: string,
      @Body() body: unknown,
      @CurrentUser() actor: AuthenticatedUser,
      @Headers('if-match') ifMatch?: string,
    ) {
      const dto = await validateDto(options.updateDto, body);
      // Optimistic concurrency (tech.md §4.1/§10.2): a client that read version N sends
      // If-Match: "N"; a stale write is rejected as 412 CONFLICT_VERSION rather than silently
      // overwriting a concurrent change. Omitting the header skips the check (useful for
      // scripts/import), matching tech.md's "updates carry If-Match" as the documented client
      // contract rather than a hard server requirement.
      const expectedVersion =
        ifMatch !== undefined ? parseInt(ifMatch.replace(/"/g, ''), 10) : undefined;
      return this.service.update(id, dto as Partial<unknown>, actor.id, expectedVersion);
    }

    @RequirePermissions(options.editPermission)
    @Post(':id/deactivate')
    deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
      return this.service.deactivate(id, actor.id);
    }

    @RequirePermissions(options.editPermission)
    @Post(':id/reactivate')
    reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
      return this.service.reactivate(id, actor.id);
    }
  }

  return mixin(BaseMasterController);
}
