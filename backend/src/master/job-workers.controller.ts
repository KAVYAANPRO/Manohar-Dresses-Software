import { Controller, Get, Query } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { JobWorkersService } from './job-workers.service';
import { CreateJobWorkerDto, UpdateJobWorkerDto } from './dto/job-worker.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const Base = MasterCrudController<JobWorkersService>({
  viewPermission: PERMISSIONS.MASTER_JOBWORKER_VIEW,
  editPermission: PERMISSIONS.MASTER_JOBWORKER_EDIT,
  createDto: CreateJobWorkerDto,
  updateDto: UpdateJobWorkerDto,
});

@Controller('api/v1/job-workers')
export class JobWorkersController extends Base {
  constructor(service: JobWorkersService) {
    super(service);
  }

  /** The generic list plus `?type=FACTORY|ARTISAN` (Factories master vs Karigars screen). */
  @RequirePermissions(PERMISSIONS.MASTER_JOBWORKER_VIEW)
  @Get()
  list(@Query() query: Record<string, unknown>) {
    const filter: Record<string, unknown> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    if (query.type === 'FACTORY' || query.type === 'ARTISAN') filter.type = query.type;
    return this.service.list(filter);
  }
}
