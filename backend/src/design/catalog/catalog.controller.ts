import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CatalogService } from './catalog.service';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './catalog-item.dto';
import { CATALOG_TAGS } from './catalog-item.schema';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PERMISSIONS } from '../../identity/permissions.catalogue';
import { validateDto } from '../../common/utils/validate-dto';
import { UploadsService } from '../../uploads/uploads.service';
import { ProblemException } from '../../common/errors/problem.exception';

/**
 * Product catalog. Viewing follows design.view, editing design.edit + design.rate.edit (every
 * entry carries a price). Prices are field-level protected (prd.md §2.3): they are omitted
 * from the response for anyone without design.rate.view, so e.g. a Packing user can browse
 * the catalog without ever receiving a price.
 */
@Controller('api/v1/catalog')
export class CatalogController {
  constructor(
    private readonly service: CatalogService,
    private readonly uploads: UploadsService,
  ) {}

  private canSeePrices(actor: AuthenticatedUser) {
    return actor.isSuperAdmin || actor.permissions.has(PERMISSIONS.DESIGN_RATE_VIEW);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_VIEW)
  @Get('meta/tags')
  tags() {
    return CATALOG_TAGS;
  }

  @RequirePermissions(PERMISSIONS.DESIGN_VIEW)
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('q') q?: string,
    @Query('tag') tag?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.list(
      { q, tag, includeInactive: includeInactive === 'true' },
      this.canSeePrices(actor),
    );
  }

  @RequirePermissions(PERMISSIONS.DESIGN_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.findById(id, this.canSeePrices(actor));
  }

  @RequirePermissions(PERMISSIONS.DESIGN_EDIT, PERMISSIONS.DESIGN_RATE_EDIT)
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreateCatalogItemDto, body);
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_EDIT, PERMISSIONS.DESIGN_RATE_EDIT)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const dto = await validateDto(UpdateCatalogItemDto, body);
    const expected = ifMatch !== undefined ? parseInt(ifMatch.replace(/"/g, ''), 10) : undefined;
    return this.service.update(id, dto, actor.id, expected);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Post(':id/deactivate')
  deactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.setActive(id, false, actor.id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Post(':id/reactivate')
  reactivate(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.setActive(id, true, actor.id);
  }

  /** Photo upload via the shared uploads module (validated in memory, streamed to Cloudinary). */
  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (file && !file.mimetype.startsWith('image/')) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'Catalog photos must be images (JPEG, PNG or WEBP).',
      );
    }
    await this.service.findById(id, false);
    const uploaded = await this.uploads.upload(file, 'catalog');
    return this.service.addPhoto(id, uploaded.url, actor.id);
  }

  @RequirePermissions(PERMISSIONS.DESIGN_EDIT)
  @Delete(':id/photos')
  removePhoto(
    @Param('id') id: string,
    @Query('url') url: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!url) throw new ProblemException('VALIDATION_FAILED', 422, 'url is required.');
    return this.service.removePhoto(id, url, actor.id);
  }
}
