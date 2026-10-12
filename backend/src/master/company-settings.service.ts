import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CompanySettings, CompanySettingsDocument } from './schemas/company-settings.schema';

@Injectable()
export class CompanySettingsService {
  constructor(
    @InjectModel(CompanySettings.name) private readonly model: Model<CompanySettingsDocument>,
  ) {}

  async get() {
    const settings = await this.model.findOne({ key: 'default' }).lean();
    return settings ?? null;
  }

  async ensureDefault(defaults: {
    legalName: string;
    state: string;
    gstin?: string;
    currentFinancialYear: string;
  }) {
    await this.model.updateOne(
      { key: 'default' },
      { $setOnInsert: { ...defaults } },
      { upsert: true },
    );
  }

  async update(patch: Partial<CompanySettings>, actorId?: string) {
    const doc = await this.model.findOneAndUpdate(
      { key: 'default' },
      { $set: { ...patch, updatedBy: actorId }, $inc: { version: 1 } },
      { new: true, upsert: true },
    );
    return doc.toObject();
  }
}
