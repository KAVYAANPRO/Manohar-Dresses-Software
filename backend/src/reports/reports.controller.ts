import { Controller, Get, Query, Res, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PERMISSIONS, reportPermission } from '../identity/permissions.catalogue';
import { toCsv } from '../common/utils/csv';
import { LabelResolverService } from './label-resolver.service';
import { ReportLabelsInterceptor } from './report-labels.interceptor';
import { REDACT, RedactFields, RedactionRule, redactFor } from '../common/redaction/redaction';
import { RequestContextStore } from '../common/context/request-context';

/**
 * RPT-01, prd.md §6.2's R1 (●) reports. Each report has a JSON route (gated by that family's
 * report.<family>.view) and a sibling CSV route (also requires report.export - NFR-08's
 * "restrict by role, log access to exports").
 */
@Controller('api/v1/reports')
@UseInterceptors(ReportLabelsInterceptor)
export class ReportsController {
  constructor(
    private readonly service: ReportsService,
    private readonly labels: LabelResolverService,
  ) {}

  private async sendCsv(
    res: Response,
    filename: string,
    rows: Array<Record<string, unknown>>,
    rules: RedactionRule[] = [],
  ) {
    // CSV bypasses the RedactionInterceptor (@Res), so money fields are stripped here (AUTH-07).
    const ctx = RequestContextStore.get();
    const visible = redactFor(rows, rules, { permissions: ctx?.permissions });
    const enriched = await this.labels.enrich(visible);
    res.header('Content-Type', 'text/csv');
    res.header('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(toCsv(enriched));
  }

  // ---- Purchase ----

  @RequirePermissions(reportPermission('purchase'))
  @RedactFields(REDACT.PURCHASE_RATES)
  @Get('purchase/history')
  purchaseHistory(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.service.purchaseHistory({ from, to, supplierId });
  }

  @RequirePermissions(reportPermission('purchase'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.PURCHASE_RATES)
  @Get('purchase/history/csv')
  async purchaseHistoryCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    await this.sendCsv(
      res,
      'purchase-history.csv',
      await this.service.purchaseHistory({ from, to, supplierId }),
      [REDACT.PURCHASE_RATES],
    );
  }

  @RequirePermissions(reportPermission('purchase'))
  @RedactFields(REDACT.PURCHASE_RATES)
  @Get('purchase/by-supplier')
  purchaseBySupplier(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.purchaseBySupplier({ from, to });
  }

  @RequirePermissions(reportPermission('purchase'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.PURCHASE_RATES)
  @Get('purchase/by-supplier/csv')
  async purchaseBySupplierCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.sendCsv(
      res,
      'purchase-by-supplier.csv',
      await this.service.purchaseBySupplier({ from, to }),
      [REDACT.PURCHASE_RATES],
    );
  }

  // ---- Inventory ----

  @RequirePermissions(reportPermission('inventory'))
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/current-raw-stock')
  currentRawStock() {
    return this.service.currentRawStock();
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/current-raw-stock/csv')
  async currentRawStockCsv(@Res() res: Response) {
    await this.sendCsv(res, 'current-raw-stock.csv', await this.service.currentRawStock(), [
      REDACT.STOCK_VALUE,
    ]);
  }

  @RequirePermissions(reportPermission('inventory'))
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/finished-product-stock')
  finishedProductStock() {
    return this.service.finishedProductStock();
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/finished-product-stock/csv')
  async finishedProductStockCsv(@Res() res: Response) {
    await this.sendCsv(
      res,
      'finished-product-stock.csv',
      await this.service.finishedProductStock(),
      [REDACT.STOCK_VALUE],
    );
  }

  @RequirePermissions(reportPermission('inventory'))
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/stock-movement')
  stockMovement(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('stockItemId') stockItemId?: string,
  ) {
    return this.service.stockMovement({ from, to, stockItemId });
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/stock-movement/csv')
  async stockMovementCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('stockItemId') stockItemId?: string,
  ) {
    await this.sendCsv(
      res,
      'stock-movement.csv',
      await this.service.stockMovement({ from, to, stockItemId }),
      [REDACT.STOCK_VALUE],
    );
  }

  @RequirePermissions(reportPermission('inventory'))
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/material-issued')
  materialIssued(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('jobWorkerId') jobWorkerId?: string,
  ) {
    return this.service.materialIssuedReport({ from, to, jobWorkerId });
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/material-issued/csv')
  async materialIssuedCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('jobWorkerId') jobWorkerId?: string,
  ) {
    await this.sendCsv(
      res,
      'material-issued.csv',
      await this.service.materialIssuedReport({ from, to, jobWorkerId }),
      [REDACT.STOCK_VALUE],
    );
  }

  @RequirePermissions(reportPermission('inventory'))
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/material-with-factory')
  materialWithFactory() {
    return this.service.materialWithFactory();
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/material-with-factory/csv')
  async materialWithFactoryCsv(@Res() res: Response) {
    await this.sendCsv(res, 'material-with-factory.csv', await this.service.materialWithFactory(), [
      REDACT.STOCK_VALUE,
    ]);
  }

  @RequirePermissions(reportPermission('inventory'))
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/stock-adjustments')
  stockAdjustments(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.stockAdjustments({ from, to });
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.REPORT_EXPORT)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/stock-adjustments/csv')
  async stockAdjustmentsCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.sendCsv(
      res,
      'stock-adjustments.csv',
      await this.service.stockAdjustments({ from, to }),
      [REDACT.STOCK_VALUE],
    );
  }

  @RequirePermissions(reportPermission('inventory'), PERMISSIONS.STOCK_VALUE_VIEW)
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/stock-valuation')
  stockValuation() {
    return this.service.stockValuation();
  }

  @RequirePermissions(
    reportPermission('inventory'),
    PERMISSIONS.STOCK_VALUE_VIEW,
    PERMISSIONS.REPORT_EXPORT,
  )
  @RedactFields(REDACT.STOCK_VALUE)
  @Get('inventory/stock-valuation/csv')
  async stockValuationCsv(@Res() res: Response) {
    await this.sendCsv(res, 'stock-valuation.csv', await this.service.stockValuation(), [
      REDACT.STOCK_VALUE,
    ]);
  }

  // ---- Manufacturing ----

  @RequirePermissions(reportPermission('manufacturing'))
  @Get('manufacturing/expected-vs-actual')
  expectedVsActual() {
    return this.service.expectedVsActual();
  }

  @RequirePermissions(reportPermission('manufacturing'), PERMISSIONS.REPORT_EXPORT)
  @Get('manufacturing/expected-vs-actual/csv')
  async expectedVsActualCsv(@Res() res: Response) {
    await this.sendCsv(res, 'expected-vs-actual.csv', await this.service.expectedVsActual());
  }

  @RequirePermissions(reportPermission('manufacturing'))
  @Get('manufacturing/pending-jobs')
  pendingJobs() {
    return this.service.pendingJobs();
  }

  @RequirePermissions(reportPermission('manufacturing'), PERMISSIONS.REPORT_EXPORT)
  @Get('manufacturing/pending-jobs/csv')
  async pendingJobsCsv(@Res() res: Response) {
    await this.sendCsv(res, 'pending-jobs.csv', await this.service.pendingJobs());
  }

  @RequirePermissions(reportPermission('manufacturing'))
  @Get('manufacturing/completed-jobs')
  completedJobs(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.completedJobs({ from, to });
  }

  @RequirePermissions(reportPermission('manufacturing'), PERMISSIONS.REPORT_EXPORT)
  @Get('manufacturing/completed-jobs/csv')
  async completedJobsCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.sendCsv(res, 'completed-jobs.csv', await this.service.completedJobs({ from, to }));
  }

  // ---- Shortage ----

  @RequirePermissions(reportPermission('shortage'))
  @Get('shortage/sent-vs-received')
  sentVsReceived() {
    return this.service.materialSentVsReceived();
  }

  @RequirePermissions(reportPermission('shortage'), PERMISSIONS.REPORT_EXPORT)
  @Get('shortage/sent-vs-received/csv')
  async sentVsReceivedCsv(@Res() res: Response) {
    await this.sendCsv(
      res,
      'shortage-sent-vs-received.csv',
      await this.service.materialSentVsReceived(),
    );
  }

  @RequirePermissions(reportPermission('shortage'))
  @Get('shortage/percent')
  shortagePercent() {
    return this.service.shortagePercent();
  }

  @RequirePermissions(reportPermission('shortage'), PERMISSIONS.REPORT_EXPORT)
  @Get('shortage/percent/csv')
  async shortagePercentCsv(@Res() res: Response) {
    await this.sendCsv(res, 'shortage-percent.csv', await this.service.shortagePercent());
  }

  // ---- Costing ----

  @RequirePermissions(reportPermission('costing'), PERMISSIONS.COSTING_VIEW)
  @Get('costing/design-wise')
  designWiseCost() {
    return this.service.designWiseCost();
  }

  @RequirePermissions(
    reportPermission('costing'),
    PERMISSIONS.COSTING_VIEW,
    PERMISSIONS.REPORT_EXPORT,
  )
  @Get('costing/design-wise/csv')
  async designWiseCostCsv(@Res() res: Response) {
    await this.sendCsv(res, 'design-wise-cost.csv', await this.service.designWiseCost());
  }

  // ---- Sales ----

  @RequirePermissions(reportPermission('sales'))
  @Get('sales/by-customer')
  salesByCustomer(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.salesByCustomer({ from, to });
  }

  @RequirePermissions(reportPermission('sales'), PERMISSIONS.REPORT_EXPORT)
  @Get('sales/by-customer/csv')
  async salesByCustomerCsv(
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.sendCsv(
      res,
      'sales-by-customer.csv',
      await this.service.salesByCustomer({ from, to }),
    );
  }

  @RequirePermissions(reportPermission('sales'))
  @Get('sales/revenue')
  revenue(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.revenue({ from, to });
  }

  @RequirePermissions(reportPermission('sales'), PERMISSIONS.REPORT_EXPORT)
  @Get('sales/revenue/csv')
  async revenueCsv(@Res() res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    await this.sendCsv(res, 'sales-revenue.csv', await this.service.revenue({ from, to }));
  }

  @RequirePermissions(reportPermission('sales'))
  @Get('sales/payment-status')
  paymentStatus() {
    return this.service.paymentStatus();
  }

  @RequirePermissions(reportPermission('sales'), PERMISSIONS.REPORT_EXPORT)
  @Get('sales/payment-status/csv')
  async paymentStatusCsv(@Res() res: Response) {
    await this.sendCsv(res, 'sales-payment-status.csv', await this.service.paymentStatus());
  }

  // ---- Compliance ----

  @RequirePermissions(reportPermission('compliance'))
  @Get('compliance/job-work-ageing')
  jobWorkAgeing() {
    return this.service.jobWorkAgeing();
  }

  @RequirePermissions(reportPermission('compliance'), PERMISSIONS.REPORT_EXPORT)
  @Get('compliance/job-work-ageing/csv')
  async jobWorkAgeingCsv(@Res() res: Response) {
    await this.sendCsv(res, 'job-work-ageing.csv', await this.service.jobWorkAgeing());
  }
}
