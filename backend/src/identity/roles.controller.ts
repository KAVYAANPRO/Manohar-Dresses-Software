import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRolePermissionsDto } from './dto/create-role.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS, ALL_STATIC_PERMISSION_KEYS } from './permissions.catalogue';

@Controller('api/v1')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermissions() // any authenticated user may read the catalogue
  @Get('roles')
  list() {
    return this.rolesService.list();
  }

  @RequirePermissions()
  @Get('permissions')
  listPermissions() {
    return ALL_STATIC_PERMISSION_KEYS;
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @Get('roles/:key')
  findOne(@Param('key') key: string) {
    return this.rolesService.findByKey(key);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @Post('roles')
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.rolesService.create(dto.key, dto.name, dto.permissions, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_ROLE_MANAGE)
  @Put('roles/:key/permissions')
  setPermissions(
    @Param('key') key: string,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.rolesService.setPermissions(key, dto.permissions, actor.id);
  }
}
