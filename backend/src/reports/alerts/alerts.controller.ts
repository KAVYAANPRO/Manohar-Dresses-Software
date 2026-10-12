import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { AlertsService } from './alerts.service';
import { InsightsService } from './insights.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { validateDto } from '../../common/utils/validate-dto';
import { ForbiddenProblemException } from '../../common/errors/problem.exception';

class MarkReadDto {
  @IsOptional() @IsArray() @IsString({ each: true }) keys?: string[];
  @IsOptional() @IsBoolean() all?: boolean;
}

/**
 * ALT-01 (in-app). Any signed-in internal user may call these; each alert/insight is filtered
 * by the permission guarding its underlying data inside the services, so a user only ever sees
 * alerts about data they could already open. Party (factory/artisan) users are refused - their
 * portal has its own scoped views.
 */
@Controller('api/v1')
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly insights: InsightsService,
  ) {}

  private assertInternal(user: AuthenticatedUser) {
    if (user.principal === 'party') {
      throw new ForbiddenProblemException('Alerts are available to internal users only.');
    }
  }

  @RequirePermissions()
  @Get('alerts')
  list(@CurrentUser() user: AuthenticatedUser) {
    this.assertInternal(user);
    return this.alerts.listForUser(user);
  }

  @RequirePermissions()
  @Post('alerts/read')
  @HttpCode(200)
  async markRead(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    this.assertInternal(user);
    const dto = await validateDto(MarkReadDto, body);
    if (dto.all) return this.alerts.markAllRead(user);
    return this.alerts.markRead(user, dto.keys ?? []);
  }

  @RequirePermissions()
  @Get('insights')
  async list2(@CurrentUser() user: AuthenticatedUser) {
    this.assertInternal(user);
    return { items: await this.insights.forUser(user) };
  }
}
