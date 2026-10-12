import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { JobWorker, JobWorkerDocument } from './schemas/job-worker.schema';
import { StockLocationsService } from './stock-locations.service';
import { CreateJobWorkerDto } from './dto/job-worker.dto';

@Injectable()
export class JobWorkersService extends MasterCrudService<JobWorker> {
  constructor(
    @InjectModel(JobWorker.name) model: Model<JobWorkerDocument>,
    private readonly stockLocationsService: StockLocationsService,
  ) {
    super(model);
  }

  /**
   * MST-06/MST-07: a factory/artisan custody location is created automatically alongside
   * the party, so material issue (Phase 2/4) always has somewhere to post to. The two writes
   * happen in one session/transaction (tech.md principle #3: "a business command is one
   * transaction") so a crash between them can never leave a party without a custody location.
   * Requires the Mongo deployment to be a replica set (docker-compose.yml starts one; so does
   * the test harness) - a standalone `mongod` cannot run multi-document transactions.
   */
  async create(dto: CreateJobWorkerDto | Partial<JobWorker>, actorId?: string): Promise<JobWorker> {
    const session = await this.model.db.startSession();
    try {
      let result!: JobWorker;
      await session.withTransaction(async () => {
        const [created] = await this.model.create(
          [{ ...dto, createdBy: actorId, updatedBy: actorId }],
          {
            session,
          },
        );
        const location = await this.stockLocationsService.createCustodyLocation(
          String(created._id),
          created.name,
          actorId,
          session,
        );
        created.custodyLocationId = location._id;
        await created.save({ session });
        result = created.toObject();
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
}
