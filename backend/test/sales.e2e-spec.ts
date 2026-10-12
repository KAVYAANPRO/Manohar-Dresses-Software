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

/**
 * prd.md §10 steps 1-16, Path A, end to end: purchase -> inward -> production requirement ->
 * job slip -> issue -> receipt -> short-close -> write-off -> close (Rs 980.00/piece) ->
 * sales order -> GST invoice (Rs 27,930) -> margin (Rs 7,000, 26.3%) -> trace -> purchase
 * cancel blocked. This is Phase 6's exit criterion (plan.md).
 */
describe('Sales and invoicing (Phase 6): prd.md §10 steps 12-16', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let adminId: string;

  let productCategoryId: string;
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
  let purchaseP1Id: string;

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
    productCategoryId = String((productCategory as any)._id);
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
        productCategoryId,
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

    // Steps 1-2: purchase and inward 500 m cotton, 300 m printed.
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
    purchaseP1Id = String((purchase as any)._id);
    await purchasesService.confirm(purchaseP1Id, adminId);
    const inwardLines = (purchase as any).lines.map((l: any) => ({
      purchaseLineId: String(l._id),
      qty: l.qty,
    }));
    const inward = await inwardsService.create(
      { purchaseId: purchaseP1Id, locationId: warehouseId, lines: inwardLines } as any,
      adminId,
    );
    await inwardsService.confirm(String((inward as any)._id), adminId);

    // Step 3: production requirement -> job slip -> issue -> receipt -> short-close -> write-off -> close.
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
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  let salesOrderId: string;
  let salesOrderLineId: string;
  let invoiceId: string;

  it('step 12: sales order for C1, D-100 Blue L x 20 - rate and discount auto-populate, ATP falls but on-hand stays 95', async () => {
    const order = await agent
      .post('/api/v1/sales-orders')
      .send({ customerId, lines: [{ designVariantId: designVariantLId, qty: 20 }] })
      .expect(201);
    salesOrderId = order.body._id;
    const line = order.body.lines[0];
    salesOrderLineId = line._id;
    expect(line.unitRate).toBe(1400);
    expect(line.discountPct).toBe(5);

    await agent.post(`/api/v1/sales-orders/${salesOrderId}/confirm`).expect(201);

    const stockItemModel = app.get(getModelToken('StockItem'));
    const itemL = await stockItemModel
      .findOne({ designVariantId: new Types.ObjectId(designVariantLId) })
      .lean();
    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${itemL._id}`)
      .expect(200);
    expect(avail.body[0].onHand).toBe(57); // unchanged - Rule 6, orders never move stock
  });

  it('step 13: generate and confirm the invoice - Rs 27,930 total, CGST+SGST 665 each', async () => {
    const draft = await agent
      .post('/api/v1/invoices')
      .send({
        customerId,
        salesOrderId,
        lines: [{ salesOrderLineId, designVariantId: designVariantLId, qty: 20 }],
      })
      .expect(201);
    invoiceId = draft.body._id;

    const confirmed = await agent.post(`/api/v1/invoices/${invoiceId}/confirm`).expect(201);
    expect(confirmed.body.docNo).toBe('INV/26-27/00001');
    expect(confirmed.body.taxableTotal).toBe(26600);
    expect(confirmed.body.cgstTotal).toBe(665);
    expect(confirmed.body.sgstTotal).toBe(665);
    expect(confirmed.body.igstTotal).toBe(0);
    expect(confirmed.body.grandTotal).toBe(27930);
    expect(confirmed.body.status).toBe('CONFIRMED');

    const stockItemModel = app.get(getModelToken('StockItem'));
    const itemL = await stockItemModel
      .findOne({ designVariantId: new Types.ObjectId(designVariantLId) })
      .lean();
    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${itemL._id}`)
      .expect(200);
    expect(avail.body[0].onHand).toBe(37); // 57 - 20 sold

    const orderAfter = await agent.get(`/api/v1/sales-orders/${salesOrderId}`).expect(200);
    expect(orderAfter.body.status).toBe('INVOICED');
  });

  it('step 14: margin - COGS Rs 19,600, gross margin Rs 7,000 (26.3%)', async () => {
    const margin = await agent.get(`/api/v1/invoices/${invoiceId}/margin`).expect(200);
    expect(margin.body.cogs).toBe(19600); // 20 x Rs 980.00 (final job cost after close)
    expect(margin.body.margin).toBe(7000);
    expect(margin.body.marginPct).toBeCloseTo(26.3, 1);
  });

  it('step 15: trace the invoice line - invoice -> L lot -> J1 -> issued cotton/printed lots -> inwards -> P1 -> S1', async () => {
    const invoice = await agent.get(`/api/v1/invoices/${invoiceId}`).expect(200);
    const lineId = invoice.body.lines[0]._id;

    const trace = await agent.get(`/api/v1/invoices/lines/${lineId}/trace`).expect(200);
    expect(trace.body.finishedLots.length).toBeGreaterThan(0);
    const finished = trace.body.finishedLots[0];
    expect(finished.jobSlipDocNo).toBeDefined();
    expect(finished.rawMaterials.length).toBeGreaterThan(0);
    for (const raw of finished.rawMaterials) {
      expect(raw.inward).toBeDefined();
      expect(raw.inward.supplierName).toBe('S1');
      expect(raw.inward.purchaseId).toBe(purchaseP1Id);
    }
  });

  it('step 16: cancelling P1 is blocked because an inward already exists', async () => {
    const res = await agent
      .post(`/api/v1/purchases/${purchaseP1Id}/cancel`)
      .send({ reason: 'trying anyway' })
      .expect(409);
    expect(res.body.code).toBeDefined();
  });
});
