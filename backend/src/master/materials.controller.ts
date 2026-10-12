import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { MaterialsService } from './materials.service';
import { CreateMaterialDto, CreateMaterialVariantDto, UpdateMaterialDto } from './dto/material.dto';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { validateDto } from '../common/utils/validate-dto';

const Base = MasterCrudController<MaterialsService>({
  viewPermission: PERMISSIONS.MASTER_MATERIAL_VIEW,
  editPermission: PERMISSIONS.MASTER_MATERIAL_EDIT,
  createDto: CreateMaterialDto,
  updateDto: UpdateMaterialDto,
});

@Controller('api/v1/materials')
export class MaterialsController extends Base {
  constructor(private readonly materialsService: MaterialsService) {
    super(materialsService);
  }

  @RequirePermissions(PERMISSIONS.MASTER_MATERIAL_VIEW)
  @Get(':id/variants')
  listVariants(@Param('id') id: string) {
    return this.materialsService.listVariants(id);
  }

  @RequirePermissions(PERMISSIONS.MASTER_MATERIAL_EDIT)
  @Post(':id/variants')
  async createVariant(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CreateMaterialVariantDto, body);
    return this.materialsService.createVariant(id, dto.colourId, dto.code, actor.id, dto.colourName);
  }
}

/** All material variants (material x colour, MST-03) with material, unit and colour populated - for line pickers. */
@Controller('api/v1/material-variants')
export class MaterialVariantsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @RequirePermissions(PERMISSIONS.MASTER_MATERIAL_VIEW)
  @Get()
  list(@Query('materialId') materialId?: string, @Query('isActive') isActive?: string) {
    return this.materialsService.listAllVariants({
      materialId,
      isActive: isActive === undefined ? undefined : isActive === 'true',
    });
  }
}
