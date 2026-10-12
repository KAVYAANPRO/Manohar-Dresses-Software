import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { NumberSeriesService } from '../common/services/number-series.service';
import { EnsureNumberSeriesDto, UpdateNumberSeriesDto } from './dto/number-series.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/settings/number-series')
export class NumberSeriesController {
  constructor(private readonly service: NumberSeriesService) {}

  @RequirePermissions(PERMISSIONS.NUMBERING_MANAGE)
  @Get()
  list() {
    return this.service.list();
  }

  @RequirePermissions(PERMISSIONS.NUMBERING_MANAGE)
  @Post()
  async ensure(@Body() body: unknown) {
    const dto = await validateDto(EnsureNumberSeriesDto, body);
    await this.service.ensureSeries(dto.docType, dto.fy, dto.prefix, dto.pad);
    return { ok: true };
  }

  @RequirePermissions(PERMISSIONS.NUMBERING_MANAGE)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    const dto = await validateDto(UpdateNumberSeriesDto, body);
    return this.service.updateFormat(id, dto);
  }
}
