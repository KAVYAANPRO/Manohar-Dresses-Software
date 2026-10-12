import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MaterialJobSlipsService, CreateMaterialJobSlipDto } from './material-job-slips.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';
import { REDACT, RedactFields } from '../common/redaction/redaction';

/** Material-based job slips: Top / Bottom / Dupatta from an inward lot, dupatta via dyeing. */
@RedactFields(REDACT.JOBWORK_MONEY, REDACT.STOCK_VALUE)
@Controller('api/v1/job-slips/by-material')
export class MaterialJobSlipsController {
  constructor(private readonly service: MaterialJobSlipsService) {}

  /** Inward lots in the main warehouse that a job slip can draw from. */
  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get('available-lots')
  availableLots(@Query('materialId') materialId?: string, @Query('q') q?: string) {
    return this.service.availableLots({ materialId, q });
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get(':id')
  summary(@Param('id') id: string) {
    return this.service.summary(id);
  }

  /** Creates the slip and immediately issues the material (stock leaves the warehouse). */
  @RequirePermissions(PERMISSIONS.JOBSLIP_EDIT, PERMISSIONS.ISSUE_EDIT, PERMISSIONS.ISSUE_CONFIRM)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateMaterialJobSlipDto, body);
    return this.service.create(dto, actor.id);
  }
}
