import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { PasswordService } from './password.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ProblemException, ValidationFailedException } from '../common/errors/problem.exception';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly passwordService: PasswordService,
  ) {}

  async list(filter: { principal?: string; jobWorkerId?: string; isActive?: boolean } = {}) {
    return this.userModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const user = await this.userModel.findById(id).lean();
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    return user;
  }

  async create(dto: CreateUserDto, createdBy?: string) {
    // A party-scoped account must always carry a jobWorkerId; there is no CHECK constraint
    // to fall back on in Mongo, so this is enforced here (see user.schema.ts note).
    if (dto.principal === 'party' && !dto.jobWorkerId) {
      throw new ValidationFailedException({ jobWorkerId: 'required when principal is "party"' });
    }
    if (dto.principal === 'internal' && dto.jobWorkerId) {
      throw new ValidationFailedException({
        jobWorkerId: 'must be empty when principal is "internal"',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const created = await this.userModel.create({
      username: dto.username.trim().toLowerCase(),
      displayName: dto.displayName,
      email: dto.email,
      mobile: dto.mobile,
      passwordHash,
      principal: dto.principal,
      jobWorkerId: dto.jobWorkerId,
      roleKeys: dto.roleKeys,
      createdBy,
      updatedBy: createdBy,
    });
    return created.toObject();
  }

  async update(id: string, dto: UpdateUserDto, updatedBy?: string) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { ...dto, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    return user.toObject();
  }

  async setRoles(id: string, roleKeys: string[], updatedBy?: string) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { roleKeys, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    return user.toObject();
  }

  async setPermissionOverrides(id: string, allow: string[], deny: string[], updatedBy?: string) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { permissionOverrides: { allow, deny }, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    return user.toObject();
  }

  /** Deactivate, never delete (AUTH-03, MST-12). */
  async deactivate(id: string, updatedBy?: string) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { isActive: false, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    return user.toObject();
  }

  async reactivate(id: string, updatedBy?: string) {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $set: { isActive: true, updatedBy }, $inc: { version: 1 } },
      { new: true },
    );
    if (!user) throw new ProblemException('NOT_FOUND', 404, 'User not found.');
    return user.toObject();
  }
}
