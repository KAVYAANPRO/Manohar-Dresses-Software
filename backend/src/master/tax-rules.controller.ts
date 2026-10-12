import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { TaxRulesService } from './tax-rules.service';
import { CreateTaxRuleDto, UpdateTaxRuleDto } from './dto/tax-rule.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<TaxRulesService>({
  viewPermission: PERMISSIONS.TAX_MANAGE,
  editPermission: PERMISSIONS.TAX_MANAGE,
  createDto: CreateTaxRuleDto,
  updateDto: UpdateTaxRuleDto,
});

@Controller('api/v1/tax-rules')
export class TaxRulesController extends Base {
  constructor(service: TaxRulesService) {
    super(service);
  }
}
