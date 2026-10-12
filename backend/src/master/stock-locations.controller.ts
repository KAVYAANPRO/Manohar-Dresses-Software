import { Controller } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { StockLocationsService } from './stock-locations.service';
import { CreateStockLocationDto, UpdateStockLocationDto } from './dto/stock-location.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';

const Base = MasterCrudController<StockLocationsService>({
  viewPermission: PERMISSIONS.STOCK_VIEW,
  editPermission: PERMISSIONS.MASTER_LOCATION_EDIT,
  createDto: CreateStockLocationDto,
  updateDto: UpdateStockLocationDto,
});

@Controller('api/v1/locations')
export class StockLocationsController extends Base {
  constructor(service: StockLocationsService) {
    super(service);
  }
}
