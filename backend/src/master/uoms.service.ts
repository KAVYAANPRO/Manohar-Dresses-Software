import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { Uom, UomDocument, UomConversion, UomConversionDocument } from './schemas/uom.schema';
import { Material, MaterialDocument } from './schemas/material.schema';
import { ProblemException } from '../common/errors/problem.exception';
import { roundQty, toDecimal } from '../common/utils/decimal';

@Injectable()
export class UomsService extends MasterCrudService<Uom> {
  constructor(
    @InjectModel(Uom.name) model: Model<UomDocument>,
    @InjectModel(UomConversion.name) private readonly conversionModel: Model<UomConversionDocument>,
    @InjectModel(Material.name) private readonly materialModel: Model<MaterialDocument>,
  ) {
    super(model);
  }

  listConversionsForMaterial(materialId: string) {
    return this.conversionModel
      .find({ materialId: new Types.ObjectId(materialId) })
      .populate('uomId')
      .lean();
  }

  async setConversion(materialId: string, uomId: string, factorToBase: number, actorId?: string) {
    if (factorToBase <= 0) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'factorToBase must be greater than zero.',
        {
          factorToBase: 'must be > 0',
        },
      );
    }
    return this.conversionModel.findOneAndUpdate(
      { materialId: new Types.ObjectId(materialId), uomId: new Types.ObjectId(uomId) },
      {
        $set: { factorToBase, updatedBy: actorId },
        $setOnInsert: { createdBy: actorId },
      },
      { upsert: true, new: true },
    );
  }

  /** Resolves a purchased quantity in any known unit to the material's base unit (MST-04, PUR-03). */
  async toBaseQuantity(materialId: string, uomId: string, quantity: number): Promise<number> {
    const conversion = await this.conversionModel
      .findOne({ materialId: new Types.ObjectId(materialId), uomId: new Types.ObjectId(uomId) })
      .lean();
    if (!conversion) {
      // The material's own base unit always converts 1:1 - no conversion row is needed for it
      // (otherwise every new material is unpurchasable until someone sets up "1 m = 1 m").
      const material = await this.materialModel.findById(materialId).lean();
      if (material && String(material.baseUomId) === String(uomId)) {
        return roundQty(toDecimal(quantity));
      }
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'No unit conversion configured for this material and unit.',
        { uomId: 'no conversion configured' },
      );
    }
    return roundQty(toDecimal(quantity).times(conversion.factorToBase));
  }
}
