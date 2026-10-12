import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import {
  Material,
  MaterialDocument,
  MaterialVariant,
  MaterialVariantDocument,
} from './schemas/material.schema';
import { Colour, ColourDocument } from './schemas/colour.schema';
import { ProblemException } from '../common/errors/problem.exception';

export interface VariantRef {
  materialVariantId?: string;
  materialId?: string;
  colourId?: string;
  /** Free-typed colour name: matched case-insensitively against the colour master, created if new. */
  colourName?: string;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class MaterialsService extends MasterCrudService<Material> {
  constructor(
    @InjectModel(Material.name) model: Model<MaterialDocument>,
    @InjectModel(MaterialVariant.name)
    private readonly variantModel: Model<MaterialVariantDocument>,
    @InjectModel(Colour.name) private readonly colourModel: Model<ColourDocument>,
  ) {
    super(model);
  }

  /**
   * STK-08: the minimum level lives on the material; stock items copy it when they are first
   * created, so keep those copies in step when it is edited here.
   */
  async update(id: string, data: Partial<Material>, actorId?: string, expectedVersion?: number) {
    const updated = await super.update(id, data, actorId, expectedVersion);
    if (data.minStockQty !== undefined) {
      const variantIds = await this.variantModel
        .find({ materialId: new Types.ObjectId(id) })
        .distinct('_id');
      if (variantIds.length) {
        await this.model.db
          .collection('stock_items')
          .updateMany(
            { materialVariantId: { $in: variantIds } },
            { $set: { minStockQty: data.minStockQty } },
          );
      }
    }
    return updated;
  }

  listVariants(materialId: string) {
    return this.variantModel
      .find({ materialId: new Types.ObjectId(materialId) })
      .populate('colourId')
      .lean();
  }

  /** Every material variant with its material and colour populated - for line pickers. */
  listAllVariants(filter: { materialId?: string; isActive?: boolean } = {}) {
    const query: Record<string, unknown> = {};
    if (filter.materialId) query.materialId = new Types.ObjectId(filter.materialId);
    if (filter.isActive !== undefined) query.isActive = filter.isActive;
    return this.variantModel
      .find(query)
      .populate('colourId')
      .populate({ path: 'materialId', populate: [{ path: 'baseUomId' }, { path: 'categoryId' }] })
      .sort({ createdAt: -1 })
      .lean();
  }

  async createVariant(
    materialId: string,
    colourId: string | undefined,
    code: string | undefined,
    actorId?: string,
    colourName?: string,
  ) {
    const material = await this.model.findById(materialId).lean();
    if (!material) throw new ProblemException('NOT_FOUND', 404, 'Material not found.');
    const colour = await this.resolveColour(colourId, colourName, actorId);
    const exists = await this.variantModel.findOne({
      materialId: new Types.ObjectId(materialId),
      colourId: colour._id,
    });
    if (exists) {
      throw new ProblemException(
        'DUPLICATE_NUMBER',
        409,
        'This material/colour combination already exists.',
      );
    }
    const created = await this.variantModel.create({
      materialId: new Types.ObjectId(materialId),
      colourId: colour._id,
      code,
      createdBy: actorId,
      updatedBy: actorId,
    });
    return created.toObject();
  }

  /**
   * Finds (or, for a new material x colour combination, creates) the material variant a
   * transaction line refers to. A line may name the variant directly, or a material plus a
   * colour (by id, or by a typed name which is added to the colour master if new - MST-03).
   */
  async resolveVariant(
    ref: VariantRef,
    actorId?: string,
    session?: ClientSession,
  ): Promise<MaterialVariantDocument> {
    if (ref.materialVariantId) {
      const v = await this.variantModel.findById(ref.materialVariantId).session(session ?? null);
      if (!v) {
        throw new ProblemException(
          'NOT_FOUND',
          404,
          `Material variant ${ref.materialVariantId} not found.`,
        );
      }
      return v;
    }
    if (!ref.materialId) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'Each line needs a material variant, or a material and a colour.',
        { materialId: 'required' },
      );
    }
    const material = await this.model
      .findById(ref.materialId)
      .session(session ?? null)
      .lean();
    if (!material) {
      throw new ProblemException('NOT_FOUND', 404, `Material ${ref.materialId} not found.`);
    }
    const colour = await this.resolveColour(ref.colourId, ref.colourName, actorId, session);
    const existing = await this.variantModel
      .findOne({ materialId: new Types.ObjectId(ref.materialId), colourId: colour._id })
      .session(session ?? null);
    if (existing) return existing;
    const [created] = await this.variantModel.create(
      [
        {
          materialId: new Types.ObjectId(ref.materialId),
          colourId: colour._id,
          createdBy: actorId,
          updatedBy: actorId,
        },
      ],
      { session },
    );
    return created;
  }

  private async resolveColour(
    colourId: string | undefined,
    colourName: string | undefined,
    actorId?: string,
    session?: ClientSession,
  ): Promise<ColourDocument> {
    if (colourId) {
      const c = await this.colourModel.findById(colourId).session(session ?? null);
      if (!c) throw new ProblemException('NOT_FOUND', 404, `Colour ${colourId} not found.`);
      return c;
    }
    const name = colourName?.trim();
    if (!name) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'Colour is required (pick one from the colour master or type a new one).',
        { colour: 'required' },
      );
    }
    const found = await this.colourModel
      .findOne({ name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })
      .session(session ?? null);
    if (found) return found;
    const [created] = await this.colourModel.create(
      [{ name, createdBy: actorId, updatedBy: actorId }],
      { session },
    );
    return created;
  }
}
