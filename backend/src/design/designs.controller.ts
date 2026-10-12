import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MasterCrudController } from '../common/controllers/master-crud.mixin';
import { DesignsService } from './designs.service';
import { CreateDesignDto, SetDesignRateDto, UpdateDesignDto } from './dto/design.dto';
import { SetBomDto } from './dto/bom.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';
import { ProblemException } from '../common/errors/problem.exception';
import { UploadsService } from '../uploads/uploads.service';

const Base = MasterCrudController<DesignsService>({
  viewPermission: PERMISSIONS.DESIGN_VIEW,
  editPermission: PERMISSIONS.DESIGN_EDIT,
  createDto: CreateDesignDto,
  updateDto: UpdateDesignDto,
});

@Controller('api/v1/designs')
@RedactFields(REDACT.DESIGN_RATE)
export class DesignsController extends Base {
  constructor(
    private readonly designsService: DesignsService,
    private readonly uploadsService: UploadsService,
  ) {
    super(designsService);
  }

  /** A real binary upload (design photo) - streamed straight to Cloudinary, never written to this server's disk (NFR-04). */
  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const uploaded = await this.uploadsService.upload(file, 'design-images');
    return this.designsService.addImage(id, uploaded.url, actor.id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_VIEW)
  @Get(':id/variants')
  listVariants(@Param('id') id: string) {
    return this.designsService.listVariants(id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Post(':id/variants')
  async regenerateVariants(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    const design = await this.designsService.findById(id);
    return this.designsService.generateVariants(
      id,
      design.colourOptions.map(String),
      design.sizeOptions.map(String),
      actor.id,
    );
  }

  @RequirePermissions(PERMISSIONS.DESIGN_BOM_VIEW)
  @Get(':id/bom')
  async getBom(@Param('id') id: string): Promise<Record<string, unknown>> {
    const current = await this.designsService.getCurrentBomDetailed(id);
    if (!current) throw new ProblemException('NOT_FOUND', 404, 'No active BOM for this design.');
    return current;
  }

  @RequirePermissions(PERMISSIONS.DESIGN_BOM_VIEW)
  @Get(':id/bom/history')
  getBomHistory(@Param('id') id: string) {
    return this.designsService.getBomHistory(id);
  }

  /** DSN-04: a POST here always creates a new BOM version - it never edits the previous one. */
  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Post(':id/bom')
  async setBom(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(SetBomDto, body);
    return this.designsService.setBom(id, dto.lines, actor.id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_VIEW)
  @Get(':id/requirements')
  getRequirements(@Param('id') id: string, @Query('qty') qty: string) {
    const totalGarments = parseInt(qty, 10);
    if (!Number.isFinite(totalGarments) || totalGarments <= 0) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'qty must be a positive integer.', {
        qty: 'invalid',
      });
    }
    return this.designsService.calculateRequirement(id, totalGarments);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_RATE_VIEW)
  @Get(':id/rate-history')
  getRateHistory(@Param('id') id: string) {
    return this.designsService.getRateHistory(id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_RATE_EDIT)
  @Post(':id/rate')
  async setRate(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(SetDesignRateDto, body);
    await this.designsService.setRate(id, dto.rate, actor.id);
    return { ok: true };
  }
}
