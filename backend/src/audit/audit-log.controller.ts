import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuditLogService } from './audit-log.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { toCsv } from '../common/utils/csv';

/** AUD-02: searchable, exportable by admin. Read-only - there is no write route here at all. */
@Controller('api/v1/audit-log')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @RequirePermissions(PERMISSIONS.AUDIT_VIEW)
  @Get()
  query(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('module') module?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.auditLogService.query({
      entityType,
      entityId,
      actorUserId,
      module,
      action,
      q,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @RequirePermissions(PERMISSIONS.AUDIT_EXPORT)
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('module') module?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
    @Query('q') q?: string,
  ) {
    const rows = await this.auditLogService.exportRows({
      entityType,
      entityId,
      actorUserId,
      module,
      action,
      q,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(toCsv(rows));
  }
}
