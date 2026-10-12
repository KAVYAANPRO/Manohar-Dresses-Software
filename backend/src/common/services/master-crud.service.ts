import { FilterQuery, Model } from 'mongoose';
import { ConflictVersionException, ProblemException } from '../errors/problem.exception';

/**
 * Generic list/get/create/update/deactivate for master data (tech.md §4.1: soft
 * deactivation only, optimistic concurrency via `version`). Concrete services extend this
 * and add entity-specific rules (duplicate checks, cross-entity side effects); it exists so
 * fifteen near-identical master-data entities do not each hand-roll the same CRUD plumbing.
 */
export abstract class MasterCrudService<T> {
  protected constructor(protected readonly model: Model<any>) {}

  list(filter: FilterQuery<T> = {}): Promise<T[]> {
    return this.model.find(filter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string): Promise<T> {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, `${this.model.modelName} not found.`);
    return doc as T;
  }

  async create(data: Partial<T>, actorId?: string): Promise<T> {
    const created = await this.model.create({ ...data, createdBy: actorId, updatedBy: actorId });
    return created.toObject();
  }

  async update(
    id: string,
    data: Partial<T>,
    actorId?: string,
    expectedVersion?: number,
  ): Promise<T> {
    const query: Record<string, unknown> = { _id: id };
    if (expectedVersion !== undefined) query.version = expectedVersion;

    const doc = await this.model.findOneAndUpdate(
      query,
      { $set: { ...data, updatedBy: actorId }, $inc: { version: 1 } },
      { new: true },
    );
    if (!doc) {
      if (expectedVersion !== undefined && (await this.model.exists({ _id: id }))) {
        throw new ConflictVersionException();
      }
      throw new ProblemException('NOT_FOUND', 404, `${this.model.modelName} not found.`);
    }
    return doc.toObject();
  }

  deactivate(id: string, actorId?: string): Promise<T> {
    return this.update(id, { isActive: false } as unknown as Partial<T>, actorId);
  }

  reactivate(id: string, actorId?: string): Promise<T> {
    return this.update(id, { isActive: true } as unknown as Partial<T>, actorId);
  }
}
