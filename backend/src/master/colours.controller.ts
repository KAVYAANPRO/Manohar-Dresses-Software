import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { ColoursService } from './colours.service';
import { CreateColourDto, UpdateColourDto } from './dto/colour.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<ColoursService>({
  viewPermission: PERMISSIONS.MASTER_MATERIAL_VIEW,
  editPermission: PERMISSIONS.MASTER_MATERIAL_EDIT,
  createDto: CreateColourDto,
  updateDto: UpdateColourDto,
});

@Controller('api/v1/colours')
export class ColoursController extends Base {
  constructor(service: ColoursService) {
    super(service);
  }
}
