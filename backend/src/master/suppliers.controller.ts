import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<SuppliersService>({
  viewPermission: PERMISSIONS.MASTER_SUPPLIER_VIEW,
  editPermission: PERMISSIONS.MASTER_SUPPLIER_EDIT,
  createDto: CreateSupplierDto,
  updateDto: UpdateSupplierDto,
});

@Controller('api/v1/suppliers')
export class SuppliersController extends Base {
  constructor(service: SuppliersService) {
    super(service);
  }
}
