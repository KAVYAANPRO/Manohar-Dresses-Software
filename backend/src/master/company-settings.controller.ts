import { Body, Controller, Get, Put } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { UpdateCompanySettingsDto } from './dto/company-settings.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';

@Controller('api/v1/settings/company')
export class CompanySettingsController {
  constructor(private readonly service: CompanySettingsService) {}

  @RequirePermissions()
  @Get()
  get() {
    return this.service.get();
  }

  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @Put()
  async update(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser) {
    const dto = await validateDto(UpdateCompanySettingsDto, body);
    return this.service.update(dto, actor.id);
  }
}
