import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { UserDocument } from './schemas/user.schema';
import { ALL_STATIC_PERMISSION_KEYS } from './permissions.catalogue';

export interface EffectivePermissions {
  isSuperAdmin: boolean;
  permissions: Set<string>;
}

/**
 * Effective permissions = (role permissions ∪ user ALLOW overrides) − user DENY overrides
 * (tech.md §9.2), computed fresh per request rather than cached in the session document, so
 * a role or override change takes effect on the user's very next request without forcing a
 * re-login.
 */
@Injectable()
export class PermissionsService {
  constructor(@InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>) {}

  async computeEffectivePermissions(
    user: Pick<UserDocument, 'roleKeys' | 'permissionOverrides'>,
  ): Promise<EffectivePermissions> {
    const roles = await this.roleModel.find({ key: { $in: user.roleKeys }, isActive: true }).lean();

    const isSuperAdmin = roles.some((r) => r.permissions.includes('*'));
    if (isSuperAdmin) {
      return { isSuperAdmin: true, permissions: new Set(ALL_STATIC_PERMISSION_KEYS) };
    }

    const fromRoles = new Set<string>();
    for (const role of roles) {
      for (const p of role.permissions) fromRoles.add(p);
    }
    for (const p of user.permissionOverrides?.allow ?? []) fromRoles.add(p);
    for (const p of user.permissionOverrides?.deny ?? []) fromRoles.delete(p);

    return { isSuperAdmin: false, permissions: fromRoles };
  }
}
