import { Body, Controller, Param, Post } from '@nestjs/common';
import { ImportService } from './import.service';
import { IMPORTABLE_ENTITIES, ImportCsvDto, ImportableEntity } from './dto/import.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';
import { ProblemException } from '../common/errors/problem.exception';

@Controller('api/v1/imports')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @RequirePermissions(PERMISSIONS.MASTER_IMPORT_RUN)
  @Post(':entity/dry-run')
  async dryRun(
    @Param('entity') entity: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(ImportCsvDto, body);
    return this.importService.dryRun(this.assertEntity(entity), dto.csv, actor.id);
  }

  @RequirePermissions(PERMISSIONS.MASTER_IMPORT_RUN)
  @Post(':entity/commit')
  async commit(
    @Param('entity') entity: string,
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const dto = await validateDto(ImportCsvDto, body);
    return this.importService.commit(this.assertEntity(entity), dto.csv, actor.id);
  }

  private assertEntity(entity: string): ImportableEntity {
    if (!IMPORTABLE_ENTITIES.includes(entity as ImportableEntity)) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Unknown import entity "${entity}". Supported: ${IMPORTABLE_ENTITIES.join(', ')}.`,
      );
    }
    return entity as ImportableEntity;
  }
}
