import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';

const Base = MasterCrudController<CustomersService>({
  viewPermission: PERMISSIONS.MASTER_CUSTOMER_VIEW,
  editPermission: PERMISSIONS.MASTER_CUSTOMER_EDIT,
  createDto: CreateCustomerDto,
  updateDto: UpdateCustomerDto,
});

@Controller('api/v1/customers')
@RedactFields(REDACT.SALES_RATES)
export class CustomersController extends Base {
  constructor(service: CustomersService) {
    super(service);
  }
}
