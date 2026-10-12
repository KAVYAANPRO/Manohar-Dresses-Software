import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PackingService } from './packing.service';
import { PackQtyDto } from './dto/pack.dto';
import { ReadyStockFilter } from './ready-stock.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';

/** PKG-01, PKG-02: no purchase or cost fields ever appear here - onHandByStockItem() never carries unitCost. */
@Controller('api/v1/packing')
export class PackingController {
  constructor(private readonly service: PackingService) {}

  @RequirePermissions(PERMISSIONS.READYSTOCK_VIEW)
  @Get('dashboard')
  dashboard(@Query() query: Record<string, string | undefined>) {
    const filter: ReadyStockFilter = {
      designId: query.designId,
      colourId: query.colourId,
      sizeId: query.sizeId,
      categoryId: query.categoryId,
    };
    return this.service.dashboard(filter);
  }

  @RequirePermissions(PERMISSIONS.PACKING_UPDATE)
  @Post(':stockItemId/pack')
  async pack(
    @Param('stockItemId') stockItemId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(PackQtyDto, body);
    return this.service.pack(stockItemId, dto.qty, actor.id);
  }

  @RequirePermissions(PERMISSIONS.PACKING_UPDATE)
  @Post(':stockItemId/unpack')
  async unpack(
    @Param('stockItemId') stockItemId: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(PackQtyDto, body);
    return this.service.unpack(stockItemId, dto.qty, actor.id);
  }
}
