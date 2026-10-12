import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { JobWorkChallanService } from './job-work-challan.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { REDACT, fieldsToRedact } from '../common/redaction/redaction';

/** DOC-01, JOB-05: print-ready HTML - the same view/permission gates as reading the underlying document. */
@Controller('api/v1/documents')
export class DocumentsController {
  constructor(
    private readonly service: DocumentsService,
    private readonly challan: JobWorkChallanService,
  ) {}

  private sendHtml(res: Response, html: string) {
    res.header('Content-Type', 'text/html');
    res.send(html);
  }

  @RequirePermissions(PERMISSIONS.SALES_INVOICE_VIEW)
  @Get('invoices/:id/print')
  async invoicePrint(@Param('id') id: string, @Res() res: Response) {
    this.sendHtml(res, await this.service.invoicePrint(id));
  }

  @RequirePermissions(PERMISSIONS.JOBSLIP_VIEW)
  @Get('job-slips/:id/print')
  async jobSlipPrint(
    @Param('id') id: string,
    @Res() res: Response,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const hidden = fieldsToRedact([REDACT.JOBWORK_MONEY], user.permissions, user.isSuperAdmin);
    this.sendHtml(res, await this.service.jobSlipPrint(id, !hidden.has('agreedRate')));
  }

  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get('material-issues/:id/print')
  async materialIssuePrint(@Param('id') id: string, @Res() res: Response) {
    this.sendHtml(res, await this.service.materialIssuePrint(id));
  }

  /** Appendix B item 2 / CGST Rule 55: delivery challan for goods sent for job work (print HTML). */
  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get('material-issues/:id/challan')
  async jobWorkChallan(@Param('id') id: string, @Res() res: Response) {
    this.sendHtml(res, await this.challan.html(id));
  }

  /** Same challan as structured data (Rule 55 fields) for the app / ITC-04 support. */
  @RequirePermissions(PERMISSIONS.ISSUE_VIEW)
  @Get('material-issues/:id/challan/data')
  jobWorkChallanData(@Param('id') id: string) {
    return this.challan.build(id);
  }
}
