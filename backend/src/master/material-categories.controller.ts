import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { MaterialCategoriesService } from './material-categories.service';
import { CreateNamedEntityDto, UpdateNamedEntityDto } from './dto/named-entity.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<MaterialCategoriesService>({
  viewPermission: PERMISSIONS.MASTER_MATERIAL_VIEW,
  editPermission: PERMISSIONS.MASTER_MATERIAL_EDIT,
  createDto: CreateNamedEntityDto,
  updateDto: UpdateNamedEntityDto,
});

@Controller('api/v1/material-categories')
export class MaterialCategoriesController extends Base {
  constructor(service: MaterialCategoriesService) {
    super(service);
  }
}
