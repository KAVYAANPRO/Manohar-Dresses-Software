import { Controller, Get, Query } from '@nestjs/common';
import { ProductionLookupsService } from './production-lookups.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';

/** Read-only helpers for the production screens. */
@Controller('api/v1/production')
@RedactFields(REDACT.STOCK_VALUE)
export class ProductionLookupsController {
  constructor(private readonly service: ProductionLookupsService) {}

  /** Material variants with name, base unit and MAIN-WH stock - BOM and issue pickers. */
  @RequirePermissions(PERMISSIONS.MASTER_MATERIAL_VIEW)
  @Get('material-options')
  materialOptions(@Query('includeInactive') includeInactive?: string) {
    return this.service.materialOptions(includeInactive === 'true');
  }

  /** Open job slips still waiting for (some of) their BOM material. */
  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get('pending-issuance')
  pendingIssuance(@Query('all') all?: string) {
    return this.service.pendingIssuance(all === 'true');
  }
}
