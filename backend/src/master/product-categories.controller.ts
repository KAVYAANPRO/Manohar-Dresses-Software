import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { ProductCategoriesService } from './product-categories.service';
import { CreateNamedEntityDto, UpdateNamedEntityDto } from './dto/named-entity.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<ProductCategoriesService>({
  viewPermission: PERMISSIONS.DESIGN_VIEW,
  editPermission: PERMISSIONS.DESIGN_EDIT,
  createDto: CreateNamedEntityDto,
  updateDto: UpdateNamedEntityDto,
});

@Controller('api/v1/product-categories')
export class ProductCategoriesController extends Base {
  constructor(service: ProductCategoriesService) {
    super(service);
  }
}
