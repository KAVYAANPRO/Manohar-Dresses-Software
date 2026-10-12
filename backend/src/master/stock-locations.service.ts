import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { StockLocation, StockLocationDocument } from './schemas/stock-location.schema';

@Injectable()
export class StockLocationsService extends MasterCrudService<StockLocation> {
  constructor(@InjectModel(StockLocation.name) model: Model<StockLocationDocument>) {
    super(model);
  }

  findByCode(code: string) {
    return this.model.findOne({ code }).lean();
  }

  /** Auto-created per job worker at party creation (MST-06). Idempotent on code collision. */
  async createCustodyLocation(
    jobWorkerId: string,
    jobWorkerName: string,
    actorId?: string,
    session?: ClientSession,
  ) {
    const code = `CUSTODY-${jobWorkerId}`;
    const existing = await this.model.findOne({ code }).session(session ?? null);
    if (existing) return existing.toObject();
    const [created] = await this.model.create(
      [
        {
          code,
          name: `Custody - ${jobWorkerName}`,
          kind: 'FACTORY_CUSTODY',
          jobWorkerId,
          createdBy: actorId,
          updatedBy: actorId,
        },
      ],
      { session },
    );
    return created.toObject();
  }
}
