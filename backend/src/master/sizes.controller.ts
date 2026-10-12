import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { SizesService } from './sizes.service';
import { CreateSizeDto, UpdateSizeDto } from './dto/size.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<SizesService>({
  viewPermission: PERMISSIONS.DESIGN_VIEW,
  editPermission: PERMISSIONS.DESIGN_EDIT,
  createDto: CreateSizeDto,
  updateDto: UpdateSizeDto,
});

@Controller('api/v1/sizes')
export class SizesController extends Base {
  constructor(service: SizesService) {
    super(service);
  }
}
