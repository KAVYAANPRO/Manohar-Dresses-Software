import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { TaxRule, TaxRuleDocument } from './schemas/tax-rule.schema';

@Injectable()
export class TaxRulesService extends MasterCrudService<TaxRule> {
  constructor(@InjectModel(TaxRule.name) model: Model<TaxRuleDocument>) {
    super(model);
  }

  /** Looks up the rule for an HSN, a per-piece taxable value, and an invoice date (§5.3, §8.1). Used from Phase 6. */
  async findApplicableRule(hsn: string, taxableValuePerPiece: number, onDate: Date) {
    return this.model
      .findOne({
        hsn,
        isActive: true,
        valueBandMin: { $lte: taxableValuePerPiece },
        $or: [
          { valueBandMax: { $gt: taxableValuePerPiece } },
          { valueBandMax: { $exists: false } },
        ],
        validFrom: { $lte: onDate },
        $and: [{ $or: [{ validTo: { $gte: onDate } }, { validTo: { $exists: false } }] }],
      })
      .lean();
  }
}
