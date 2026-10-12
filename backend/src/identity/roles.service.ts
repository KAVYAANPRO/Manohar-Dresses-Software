import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, RoleDocument } from './schemas/role.schema';
import { ProblemException } from '../common/errors/problem.exception';
import { ALL_STATIC_PERMISSION_KEYS } from './permissions.catalogue';

/** Rejects keys outside the catalogue, so a typo can never silently grant nothing (or '*'). */
function assertKnownPermissions(permissions: string[]) {
  const known = new Set(ALL_STATIC_PERMISSION_KEYS);
  // '*' is the Super Admin wildcard seeded by DEFAULT_ROLES (roles.seed-data.ts).
  const unknown = permissions.filter((p) => p !== '*' && !known.has(p));
  if (unknown.length) {
    throw new ProblemException('VALIDATION_FAILED', 422, `Unknown permission key(s): ${unknown.join(', ')}`);
  }
}

@Injectable()
export class RolesService {
  constructor(@InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>) {}

  list() {
    return this.roleModel.find().sort({ name: 1 }).lean();
  }

  async findByKey(key: string) {
    const role = await this.roleModel.findOne({ key }).lean();
    if (!role) throw new ProblemException('NOT_FOUND', 404, `Role ${key} not found.`);
    return role;
  }

  async create(key: string, name: string, permissions: string[], createdBy?: string) {
    assertKnownPermissions(permissions);
    const created = await this.roleModel.create({
      key,
      name,
      permissions,
      createdBy,
      updatedBy: createdBy,
    });
    return created.toObject();
  }

  async setPermissions(key: string, permissions: string[], updatedBy?: string) {
    // The Super Admin role is defined by '*' (PermissionsService); editing it could lock the
    // owner out of the system, so it is never editable through the API.
    const existing = await this.roleModel.findOne({ key }).lean();
    if (existing?.permissions?.includes('*')) {
      throw new ProblemException('ROLE_PROTECTED', 409, 'The Super Admin role always has every permission and cannot be edited.');
    }
    assertKnownPermissions(permissions);
    const role = await this.roleModel.findOneAndUpdate(
      { key },
      { $set: { permissions, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!role) throw new ProblemException('NOT_FOUND', 404, `Role ${key} not found.`);
    return role.toObject();
  }

  async deactivate(key: string, updatedBy?: string) {
    const role = await this.roleModel.findOneAndUpdate(
      { key },
      { $set: { isActive: false, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!role) throw new ProblemException('NOT_FOUND', 404, `Role ${key} not found.`);
    return role.toObject();
  }
}
