import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsMongoId, IsNumber, Min } from 'class-validator';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { UomsService } from './uoms.service';
import { CreateUomDto, UpdateUomDto } from './dto/uom.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { validateDto } from '../common/utils/validate-dto';

class SetConversionDto {
  @IsMongoId() uomId!: string;
  @IsNumber() @Min(0.000001) factorToBase!: number;
}

const Base = MasterCrudController<UomsService>({
  viewPermission: PERMISSIONS.MASTER_MATERIAL_VIEW,
  editPermission: PERMISSIONS.MASTER_MATERIAL_EDIT,
  createDto: CreateUomDto,
  updateDto: UpdateUomDto,
});

@Controller('api/v1/uoms')
export class UomsController extends Base {
  constructor(service: UomsService) {
    super(service);
  }
}

/** MST-04: per-material unit conversions, nested under /materials/{id}/uom-conversions per tech.md §10.3. */
@Controller('api/v1/materials/:materialId/uom-conversions')
export class MaterialUomConversionsController {
  constructor(private readonly uomsService: UomsService) {}

  @RequirePermissions(PERMISSIONS.MASTER_MATERIAL_VIEW)
  @Get()
  list(@Param('materialId') materialId: string) {
    return this.uomsService.listConversionsForMaterial(materialId);
  }

  @RequirePermissions(PERMISSIONS.MASTER_MATERIAL_EDIT)
  @Post()
  async set(
    @Param('materialId') materialId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(SetConversionDto, body);
    return this.uomsService.setConversion(materialId, dto.uomId, dto.factorToBase, actor.id);
  }
}
