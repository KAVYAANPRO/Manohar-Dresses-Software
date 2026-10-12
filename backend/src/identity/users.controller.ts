import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetRolesDto } from './dto/set-roles.dto';
import { SetPermissionOverridesDto } from './dto/set-permission-overrides.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from './permissions.catalogue';

@Controller('api/v1/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Get()
  list(@Query('principal') principal?: string, @Query('jobWorkerId') jobWorkerId?: string) {
    // An explicit `{ field: undefined }` key reaches MongoDB as a real (non-matching) filter
    // rather than being dropped, so an omitted query param must not be forwarded at all.
    const filter: { principal?: string; jobWorkerId?: string } = {};
    if (principal !== undefined) filter.principal = principal;
    if (jobWorkerId !== undefined) filter.jobWorkerId = jobWorkerId;
    return this.usersService.list(filter);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.update(id, dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Put(':id/roles')
  setRoles(
    @Param('id') id: string,
    @Body() dto: SetRolesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.setRoles(id, dto.roleKeys, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Put(':id/permission-overrides')
  setOverrides(
    @Param('id') id: string,
    @Body() dto: SetPermissionOverridesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.usersService.setPermissionOverrides(id, dto.allow, dto.deny, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.deactivate(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.usersService.reactivate(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Post(':id/reset-password')
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    await this.authService.adminResetPassword(id, dto.newPassword);
    return { ok: true };
  }

  @RequirePermissions(PERMISSIONS.IDENTITY_USER_MANAGE)
  @Post(':id/revoke-sessions')
  async revokeSessions(@Param('id') id: string) {
    await this.authService.revokeAllSessionsForUser(id, 'admin force-logout');
    return { ok: true };
  }
}
