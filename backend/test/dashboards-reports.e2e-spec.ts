import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { SuppliersService } from '../src/master/suppliers.service';
import { CustomersService } from '../src/master/customers.service';
import { TaxRulesService } from '../src/master/tax-rules.service';
import { CompanySettingsService } from '../src/master/company-settings.service';
import { MaterialCategoriesService } from '../src/master/material-categories.service';
import { ColoursService } from '../src/master/colours.service';
import { MaterialsService } from '../src/master/materials.service';
import { UomsService } from '../src/master/uoms.service';
import { ProductCategoriesService } from '../src/master/product-categories.service';
import { SizesService } from '../src/master/sizes.service';
import { JobWorkersService } from '../src/master/job-workers.service';
import { PurchasesService } from '../src/purchasing/purchases.service';
import { InwardsService } from '../src/purchasing/inwards.service';

/** Phase 7: DSH-01 dashboards, RPT-01 reports, and the audit-log CSV export, built on the same D-100 scenario. */
describe('Dashboards, reports, and audit export (Phase 7)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let adminId: string;

  let colourBlueId: string;
  let sizeMId: string;
  let sizeLId: string;
  let metreUomId: string;
  let cottonVariantId: string;
  let printedVariantId: string;
  let warehouseId: string;
  let designId: string;
  let designVariantLId: string;
  let factoryAId: string;
  let customerId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    await seedRoles(app);

    const usersService = app.get(UsersService);
    const admin = await usersService.create({
      username: 'admin',
      password: 'SuperSecret123!',
      principal: 'internal',
      roleKeys: ['SUPER_ADMIN'],
    } as any);
    adminId = String((admin as any)._id);

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);

    await app.get(CompanySettingsService).update(
      {
        legalName: 'Test Garments Pvt Ltd',
        state: 'Maharashtra',
        gstin: '27AAAAA0000A1Z5',
        currentFinancialYear: '26-27',
      },
      adminId,
    );
    await app.get(TaxRulesService).create(
      {
        hsn: '6204',
        valueBandMin: 0,
        valueBandMax: 2500,
        ratePct: 5,
        validFrom: new Date('2025-01-01'),
      } as any,
      adminId,
    );

    const category = await app.get(MaterialCategoriesService).create({ name: 'Top Fabric' } as any);
    const productCategory = await app
      .get(ProductCategoriesService)
      .create({ name: 'Kurti Set' } as any);
    const colourBlue = await app.get(ColoursService).create({ name: 'Blue' } as any);
    colourBlueId = String((colourBlue as any)._id);
    const sizeM = await app.get(SizesService).create({ name: 'M', sortOrder: 0 } as any);
    sizeMId = String((sizeM as any)._id);
    const sizeL = await app.get(SizesService).create({ name: 'L', sortOrder: 1 } as any);
    sizeLId = String((sizeL as any)._id);
    const metreUom = await app.get(UomsService).create({ code: 'M', name: 'Metre' } as any);
    metreUomId = String((metreUom as any)._id);

    const materialsService = app.get(MaterialsService);
    const cotton = await materialsService.create({
      name: 'Cotton Fabric',
      categoryId: String((category as any)._id),
      baseUomId: metreUomId,
    } as any);
    const cottonVariant = await materialsService.createVariant(
      String((cotton as any)._id),
      colourBlueId,
      undefined,
    );
    cottonVariantId = String((cottonVariant as any)._id);
    await app.get(UomsService).setConversion(String((cotton as any)._id), metreUomId, 1);

    const printed = await materialsService.create({
      name: 'Printed Fabric',
      categoryId: String((category as any)._id),
      baseUomId: metreUomId,
    } as any);
    const printedVariant = await materialsService.createVariant(
      String((printed as any)._id),
      colourBlueId,
      undefined,
    );
    printedVariantId = String((printedVariant as any)._id);
    await app.get(UomsService).setConversion(String((printed as any)._id), metreUomId, 1);

    const locationModel = app.get(getModelToken('StockLocation'));
    const warehouse = await locationModel.findOne({ code: 'MAIN-WH' }).lean();
    warehouseId = String(warehouse._id);

    const design = await agent
      .post('/api/v1/designs')
      .send({
        designNo: 'D-100',
        name: 'Kurti Set',
        productCategoryId: String((productCategory as any)._id),
        colourOptions: [colourBlueId],
        sizeOptions: [sizeMId, sizeLId],
        defaultSellingRate: 1400,
        hsn: '6204',
      })
      .expect(201);
    designId = design.body._id;
    await agent
      .post(`/api/v1/designs/${designId}/bom`)
      .send({
        lines: [
          {
            role: 'Top',
            materialVariantId: cottonVariantId,
            qtyPerGarmentBase: 2,
            allowancePct: 0,
          },
          {
            role: 'Bottom',
            materialVariantId: cottonVariantId,
            qtyPerGarmentBase: 2,
            allowancePct: 0,
          },
          {
            role: 'Dupatta',
            materialVariantId: printedVariantId,
            qtyPerGarmentBase: 2.5,
            allowancePct: 0,
          },
        ],
      })
      .expect(201);

    const factoryA = await app
      .get(JobWorkersService)
      .create({ name: 'Factory A', type: 'FACTORY' } as any);
    factoryAId = String((factoryA as any)._id);

    const customer = await app
      .get(CustomersService)
      .create({ name: 'C1', state: 'Maharashtra', defaultDiscountPct: 5 } as any, adminId);
    customerId = String((customer as any)._id);

    const supplier = await app.get(SuppliersService).create({ name: 'S1' } as any);
    const purchasesService = app.get(PurchasesService);
    const inwardsService = app.get(InwardsService);
    const purchase = await purchasesService.create(
      {
        supplierId: String((supplier as any)._id),
        supplierInvoiceNo: 'INV-P1P2',
        lines: [
          { materialVariantId: cottonVariantId, uomId: metreUomId, qty: 500, rate: 120 },
          { materialVariantId: printedVariantId, uomId: metreUomId, qty: 300, rate: 150 },
        ],
      } as any,
      adminId,
    );
    await purchasesService.confirm(String((purchase as any)._id), adminId);
    const inwardLines = (purchase as any).lines.map((l: any) => ({
      purchaseLineId: String(l._id),
      qty: l.qty,
    }));
    const inward = await inwardsService.create(
      {
        purchaseId: String((purchase as any)._id),
        locationId: warehouseId,
        lines: inwardLines,
      } as any,
      adminId,
    );
    await inwardsService.confirm(String((inward as any)._id), adminId);

    const order = await agent
      .post('/api/v1/production-orders')
      .send({
        designId,
        quantities: [
          { colourId: colourBlueId, sizeId: sizeMId, qty: 40 },
          { colourId: colourBlueId, sizeId: sizeLId, qty: 60 },
        ],
      })
      .expect(201);

    const slip = await agent
      .post('/api/v1/job-slips')
      .send({
        jobType: 'MANUFACTURING',
        jobWorkerId: factoryAId,
        designId,
        productionOrderId: order.body._id,
        expectedOutputLines: [
          { colourId: colourBlueId, sizeId: sizeMId, expectedQty: 40 },
          { colourId: colourBlueId, sizeId: sizeLId, expectedQty: 60 },
        ],
        expectedCompletionDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        chargeBasis: 'PER_PIECE',
        agreedRate: 80,
      })
      .expect(201);
    const jobSlipId = slip.body._id;

    const issue = await agent
      .post('/api/v1/material-issues')
      .send({
        jobSlipId,
        lines: [
          { materialVariantId: cottonVariantId, bomRole: 'Top+Bottom', qtyBase: 400 },
          { materialVariantId: printedVariantId, bomRole: 'Dupatta', qtyBase: 250 },
        ],
      })
      .expect(201);
    await agent.post(`/api/v1/material-issues/${issue.body._id}/confirm`).expect(201);

    const receipt = await agent
      .post('/api/v1/job-receipts')
      .send({
        jobSlipId,
        lines: [
          {
            colourId: colourBlueId,
            sizeId: sizeMId,
            receivedQty: 38,
            acceptedQty: 38,
            rejectedQty: 0,
            damagedQty: 0,
          },
          {
            colourId: colourBlueId,
            sizeId: sizeLId,
            receivedQty: 57,
            acceptedQty: 57,
            rejectedQty: 0,
            damagedQty: 0,
          },
        ],
      })
      .expect(201);
    await agent.post(`/api/v1/job-receipts/${receipt.body._id}/confirm`).expect(201);
    await agent
      .post(`/api/v1/job-slips/${jobSlipId}/short-close`)
      .send({ reason: 'factory could not complete the last 5' })
      .expect(201);
    await agent
      .post(`/api/v1/job-slips/${jobSlipId}/write-off`)
      .send({ reason: 'shortage within tolerance' })
      .expect(201);
    await agent.post(`/api/v1/job-slips/${jobSlipId}/close`).expect(201);

    const designVariantModel = app.get(getModelToken('DesignVariant'));
    const variantL = await designVariantModel
      .findOne({
        designId: new Types.ObjectId(designId),
        colourId: new Types.ObjectId(colourBlueId),
        sizeId: new Types.ObjectId(sizeLId),
      })
      .lean();
    designVariantLId = String(variantL._id);

    const salesOrder = await agent
      .post('/api/v1/sales-orders')
      .send({ customerId, lines: [{ designVariantId: designVariantLId, qty: 20 }] })
      .expect(201);
    await agent.post(`/api/v1/sales-orders/${salesOrder.body._id}/confirm`).expect(201);
    const draft = await agent
      .post('/api/v1/invoices')
      .send({
        customerId,
        salesOrderId: salesOrder.body._id,
        lines: [
          {
            salesOrderLineId: salesOrder.body.lines[0]._id,
            designVariantId: designVariantLId,
            qty: 20,
          },
        ],
      })
      .expect(201);
    await agent.post(`/api/v1/invoices/${draft.body._id}/confirm`).expect(201);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('DSH-01: admin dashboard reflects ready stock, sales, and pending payments', async () => {
    const res = await agent.get('/api/v1/dashboards/admin').expect(200);
    expect(res.body.totalReadyStock).toBe(75); // M 38 + (L 57 - 20 sold)
    expect(res.body.sales).toBe(27930);
    expect(res.body.pendingPaymentsCount).toBe(1);
    expect(res.body.jobsInProgress).toBe(0);
  });

  it('DSH-01: sales dashboard shows billing and available ready stock', async () => {
    const res = await agent.get('/api/v1/dashboards/sales').expect(200);
    expect(res.body.billing).toBe(27930);
    expect(res.body.salesOrdersOpen).toBe(0); // fully invoiced
    expect(res.body.recentSales.length).toBe(1);
  });

  it('DSH-01: packing dashboard exposes on-hand/packed/pending per finished item, no cost', async () => {
    const res = await agent.get('/api/v1/dashboards/packing').expect(200);
    expect(res.body.readyStockTotal).toBe(75); // M 38 + (L 57 - 20 sold)
    for (const row of res.body.designWiseStock) expect((row as any).unitCost).toBeUndefined();
  });

  it('RPT-01: purchase history and inventory current-raw-stock reports return rows', async () => {
    const history = await agent.get('/api/v1/reports/purchase/history').expect(200);
    expect(history.body.length).toBe(1);
    expect(history.body[0].totalAmount).toBe(105000); // 500x120 + 300x150

    const rawStock = await agent.get('/api/v1/reports/inventory/current-raw-stock').expect(200);
    expect(rawStock.body.length).toBeGreaterThan(0);
  });

  it('RPT-01: sales revenue and CSV export both work, CSV has a header row', async () => {
    const revenue = await agent.get('/api/v1/reports/sales/revenue').expect(200);
    expect(revenue.body.length).toBe(1);
    expect(revenue.body[0].grandTotal).toBe(27930);

    const csv = await agent.get('/api/v1/reports/sales/revenue/csv').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.trim().split('\n');
    expect(lines[0]).toContain('docNo');
    expect(lines.length).toBe(2);
  });

  it('RPT-01: costing design-wise report requires costing.view and shows cost per piece Rs 980.00', async () => {
    const res = await agent.get('/api/v1/reports/costing/design-wise').expect(200);
    const row = res.body.find((r: any) => r.designId === designId);
    expect(row.costPerPiece).toBe(980);
  });

  it('AUD-02: audit log CSV export returns a header row and at least one entry', async () => {
    const csv = await agent.get('/api/v1/audit-log/export?entityType=Design').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    const lines = csv.text.trim().split('\n');
    expect(lines[0]).toContain('entityType');
    expect(lines.length).toBeGreaterThan(1);
  });

  it('a user without report.export permission cannot reach the CSV route', async () => {
    const usersService = app.get(UsersService);
    await usersService.create({
      username: 'sales-user',
      password: 'SalesPass123!',
      principal: 'internal',
      roleKeys: ['SALES'],
    } as any);
    const salesAgent = request.agent(app.getHttpServer());
    await salesAgent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'sales-user', password: 'SalesPass123!' })
      .expect(200);

    await salesAgent.get('/api/v1/reports/sales/revenue').expect(200);
    const res = await salesAgent.get('/api/v1/reports/sales/revenue/csv');
    expect(res.status).toBe(403);
  });
});
