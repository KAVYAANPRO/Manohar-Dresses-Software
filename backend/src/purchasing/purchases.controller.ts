import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, MinLength } from 'class-validator';
import { PurchasesService } from './purchases.service';
import { CancelPurchaseDto, CreatePurchaseDto, UpdatePurchaseDto } from './dto/purchase.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { REDACT, RedactFields } from '../common/redaction/redaction';
import { validateDto } from '../common/utils/validate-dto';
import { UploadsService } from '../uploads/uploads.service';

class AddAttachmentDto {
  @IsString() @MinLength(1) url!: string;
}

@Controller('api/v1/purchases')
@RedactFields(REDACT.PURCHASE_RATES)
export class PurchasesController {
  constructor(
    private readonly service: PurchasesService,
    private readonly uploadsService: UploadsService,
  ) {}

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get()
  list(@Query('status') status?: string, @Query('supplierId') supplierId?: string) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (supplierId) filter.supplierId = supplierId;
    return this.service.list(filter);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get('pending-inward')
  pendingInward() {
    return this.service.pendingInward();
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_EDIT)
  @Idempotent()
  @Post()
  async create(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(CreatePurchaseDto, body);
    return this.service.create(dto, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_EDIT)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
    @Headers('if-match') ifMatch?: string,
  ) {
    const dto = await validateDto(UpdatePurchaseDto, body);
    const expectedVersion =
      ifMatch !== undefined ? parseInt(ifMatch.replace(/"/g, ''), 10) : undefined;
    return this.service.update(id, dto, actor.id, expectedVersion);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_CONFIRM)
  @Idempotent()
  @Post(':id/confirm')
  confirm(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.confirm(id, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PURCHASE_CANCEL)
  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(CancelPurchaseDto, body);
    return this.service.cancel(id, dto.reason, actor.id);
  }

  /**
   * PUR-07: attachment upload. Object storage (T-10, S3-compatible) isn't wired up in this
   * pass, so this stores a caller-supplied URL rather than accepting a binary upload - a
   * documented placeholder until file storage exists.
   */
  @RequirePermissions(PERMISSIONS.PURCHASE_EDIT)
  @Post(':id/attachments')
  async addAttachment(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(AddAttachmentDto, body);
    return this.service.addAttachment(id, dto.url, actor.id);
  }

  /** PUR-07: a real binary upload (invoice scan, delivery note) - streamed straight to Cloudinary, never written to this server's disk. */
  @RequirePermissions(PERMISSIONS.PURCHASE_EDIT)
  @Post(':id/attachments/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const uploaded = await this.uploadsService.upload(file, 'purchase-attachments');
    return this.service.addAttachment(id, uploaded.url, actor.id);
  }
}
