import { Controller, Get, Param, Query } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const Base = MasterCrudController<AgentsService>({
  viewPermission: PERMISSIONS.MASTER_CUSTOMER_VIEW,
  editPermission: PERMISSIONS.MASTER_CUSTOMER_EDIT,
  createDto: CreateAgentDto,
  updateDto: UpdateAgentDto,
});

/** Sales agents share the customer-master permissions (agents are a customer-side master). */
@Controller('api/v1/agents')
@RedactFields(REDACT.SALES_RATES)
export class AgentsController extends Base {
  constructor(service: AgentsService) {
    super(service);
  }

  @RequirePermissions(PERMISSIONS.MASTER_CUSTOMER_VIEW)
  @Get()
  override list(@Query() query: Record<string, unknown>) {
    const filter: Record<string, unknown> = {};
    if (query.isActive !== undefined) filter.isActive = query.isActive === 'true';
    return this.service.listWithCounts(filter);
  }

  @RequirePermissions(PERMISSIONS.MASTER_CUSTOMER_VIEW)
  @Get(':id/summary')
  summaryFor(@Param('id') id: string) {
    return this.service.summary(id);
  }
}
