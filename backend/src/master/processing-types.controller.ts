import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { ProcessingTypesService } from './processing-types.service';
import { CreateNamedEntityDto, UpdateNamedEntityDto } from './dto/named-entity.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

// No dedicated key in the Appendix B catalogue for processing types; they configure job
// work, so they are gated by the same keys as materials (closest fit).
const Base = MasterCrudController<ProcessingTypesService>({
  viewPermission: PERMISSIONS.MASTER_MATERIAL_VIEW,
  editPermission: PERMISSIONS.MASTER_MATERIAL_EDIT,
  createDto: CreateNamedEntityDto,
  updateDto: UpdateNamedEntityDto,
});

@Controller('api/v1/processing-types')
export class ProcessingTypesController extends Base {
  constructor(service: ProcessingTypesService) {
    super(service);
  }
}
