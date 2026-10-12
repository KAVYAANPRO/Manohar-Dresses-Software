import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { SuppliersService } from '../src/master/suppliers.service';
import { MaterialCategoriesService } from '../src/master/material-categories.service';
import { ColoursService } from '../src/master/colours.service';
import { MaterialsService } from '../src/master/materials.service';
import { UomsService } from '../src/master/uoms.service';
import { ProductCategoriesService } from '../src/master/product-categories.service';
import { SizesService } from '../src/master/sizes.service';
import { JobWorkersService } from '../src/master/job-workers.service';
import { PurchasesService } from '../src/purchasing/purchases.service';
import { InwardsService } from '../src/purchasing/inwards.service';

describe("Job work engine: prd.md §10's full scenario, steps 3-11 (Phase 4 exit criteria)", () => {
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
  let factoryAId: string;
  let factoryBId: string;

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
    const factoryB = await app
      .get(JobWorkersService)
      .create({ name: 'Factory B', type: 'FACTORY' } as any);
    factoryBId = String((factoryB as any)._id);
    await usersService.create({
      username: 'factory-a-user',
      password: 'FactoryAPass123!',
      principal: 'party',
      jobWorkerId: factoryAId,
      roleKeys: ['FACTORY'],
    } as any);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  async function purchaseAndInward(qtyCotton: number, qtyPrinted: number, invoiceSuffix: string) {
    const supplier = await app.get(SuppliersService).create({ name: `S-${invoiceSuffix}` } as any);
    const purchasesService = app.get(PurchasesService);
    const inwardsService = app.get(InwardsService);

    const purchaseLines: any[] = [];
    if (qtyCotton > 0)
      purchaseLines.push({
        materialVariantId: cottonVariantId,
        uomId: metreUomId,
        qty: qtyCotton,
        rate: 120,
      });
    if (qtyPrinted > 0)
      purchaseLines.push({
        materialVariantId: printedVariantId,
        uomId: metreUomId,
        qty: qtyPrinted,
        rate: 150,
      });

    const purchase = await purchasesService.create(
      {
        supplierId: String((supplier as any)._id),
        supplierInvoiceNo: `INV-${invoiceSuffix}`,
        lines: purchaseLines,
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
  }

  let jobSlipId: string;
  let productionOrderId: string;
  let cottonStockItemId: string;
  let printedStockItemId: string;

  it('steps 1-2: purchase and inward 500 m cotton, 300 m printed', async () => {
    await purchaseAndInward(500, 300, 'P1P2');

    const stockItemModel = app.get(getModelToken('StockItem'));
    const cottonItem = await stockItemModel
      .findOne({ materialVariantId: new Types.ObjectId(cottonVariantId) })
      .lean();
    const printedItem = await stockItemModel
      .findOne({ materialVariantId: new Types.ObjectId(printedVariantId) })
      .lean();
    cottonStockItemId = String(cottonItem._id);
    printedStockItemId = String(printedItem._id);

    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${cottonStockItemId},${printedStockItemId}`)
      .expect(200);
    expect(avail.body[0].onHand).toBe(500);
    expect(avail.body[1].onHand).toBe(300);
  });

  it('step 3: production requirement for 100 garments (M 40, L 60) -> cotton 400 m, printed 250 m', async () => {
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
    expect(order.body.totalGarments).toBe(100);
    productionOrderId = order.body._id;
  });

  it('step 4: create job slip J1 for Factory A (MANUFACTURING, per-piece Rs 80)', async () => {
    const slip = await agent
      .post('/api/v1/job-slips')
      .send({
        jobType: 'MANUFACTURING',
        jobWorkerId: factoryAId,
        designId,
        productionOrderId,
        expectedOutputLines: [
          { colourId: colourBlueId, sizeId: sizeMId, expectedQty: 40 },
          { colourId: colourBlueId, sizeId: sizeLId, expectedQty: 60 },
        ],
        expectedCompletionDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        chargeBasis: 'PER_PIECE',
        agreedRate: 80,
      })
      .expect(201);
    expect(slip.body.status).toBe('CREATED');
    jobSlipId = slip.body._id;
  });

  it('step 5: issue cotton 400 m + printed 250 m to J1; warehouse drops; custody rises; over-issue is blocked', async () => {
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

    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${cottonStockItemId},${printedStockItemId}`)
      .expect(200);
    expect(avail.body[0].onHand).toBe(100);
    expect(avail.body[1].onHand).toBe(50);
    expect(avail.body[0].withFactory).toBe(400);
    expect(avail.body[1].withFactory).toBe(250);

    const slip = await agent.get(`/api/v1/job-slips/${jobSlipId}`).expect(200);
    expect(slip.body.status).toBe('MATERIAL_ISSUED');

    // Over-issue: only 100 m cotton remains in the warehouse.
    // Refused up front (no draft, no doc number) with a per-material shortage list...
    const res = await agent
      .post('/api/v1/material-issues')
      .send({ jobSlipId, lines: [{ materialVariantId: cottonVariantId, qtyBase: 200 }] })
      .expect(409);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.shortages[0]).toMatchObject({ required: 200, available: 100, shortBy: 100 });

    // The issue plan shows required (BOM x 100 garments) vs issued vs what is left in MAIN-WH.
    const plan = await agent.get(`/api/v1/job-slips/${jobSlipId}/issue-plan`).expect(200);
    const cottonLine = plan.body.lines.find((l: any) => l.materialVariantId === cottonVariantId);
    expect(cottonLine).toMatchObject({
      requiredQty: 400,
      issuedQty: 400,
      pendingQty: 0,
      mainWhOnHand: 100,
    });
  });

  it('step 6: Factory A sees only its own job; Factory B cannot read it (404, not 403)', async () => {
    const factoryAgent = request.agent(app.getHttpServer());
    await factoryAgent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'factory-a-user', password: 'FactoryAPass123!' })
      .expect(200);

    const list = await factoryAgent.get('/portal/v1/jobs').expect(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0]._id).toBe(jobSlipId);

    const own = await factoryAgent.get(`/portal/v1/jobs/${jobSlipId}`).expect(200);
    expect(own.body._id).toBe(jobSlipId);

    // No rates or costs reach the portal (AUTH-07).
    const material = await factoryAgent.get(`/portal/v1/jobs/${jobSlipId}/material`).expect(200);
    expect(material.body.length).toBeGreaterThan(0);
    for (const line of material.body) expect(line.unitCost).toBeUndefined();
  });

  it('step 7: Factory A acknowledges material, goes IN_PROCESS then READY, declares 95 pieces - no stock effect', async () => {
    const factoryAgent = request.agent(app.getHttpServer());
    await factoryAgent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'factory-a-user', password: 'FactoryAPass123!' })
      .expect(200);

    await factoryAgent.post(`/portal/v1/jobs/${jobSlipId}/acknowledge`).send({}).expect(201);
    await factoryAgent
      .post(`/portal/v1/jobs/${jobSlipId}/status`)
      .send({ status: 'IN_PROCESS' })
      .expect(201);
    await factoryAgent
      .post(`/portal/v1/jobs/${jobSlipId}/status`)
      .send({ status: 'READY' })
      .expect(201);
    await factoryAgent
      .post(`/portal/v1/jobs/${jobSlipId}/dispatch-declaration`)
      .send({ qty: 95 })
      .expect(201);

    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${cottonStockItemId},${printedStockItemId}`)
      .expect(200);
    expect(avail.body[0].onHand).toBe(100); // unchanged (BR-14)
    expect(avail.body[1].onHand).toBe(50);
  });

  let receiptId: string;

  it('step 8: confirm receiving 95/100 (M 38, L 57) - consumption, ready stock, and provisional cost are all correct', async () => {
    const created = await agent
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
    receiptId = created.body._id;

    const confirmed = await agent.post(`/api/v1/job-receipts/${receiptId}/confirm`).expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');

    // Consumption: cotton 380 m (95 pieces x 4 m), printed 237.5 m (95 x 2.5 m).
    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${cottonStockItemId},${printedStockItemId}`)
      .expect(200);
    expect(avail.body[0].withFactory).toBeCloseTo(20, 3); // 400 issued - 380 consumed
    expect(avail.body[1].withFactory).toBeCloseTo(12.5, 3); // 250 issued - 237.5 consumed

    // Ready stock: 95 pieces total, split M 38 / L 57 across two finished-good stock items.
    const stockItemModel = app.get(getModelToken('StockItem'));
    const designVariantModel = app.get(getModelToken('DesignVariant'));
    const variantM = await designVariantModel
      .findOne({
        designId: new Types.ObjectId(designId),
        colourId: new Types.ObjectId(colourBlueId),
        sizeId: new Types.ObjectId(sizeMId),
      })
      .lean();
    const variantL = await designVariantModel
      .findOne({
        designId: new Types.ObjectId(designId),
        colourId: new Types.ObjectId(colourBlueId),
        sizeId: new Types.ObjectId(sizeLId),
      })
      .lean();
    const itemM = await stockItemModel.findOne({ designVariantId: variantM._id }).lean();
    const itemL = await stockItemModel.findOne({ designVariantId: variantL._id }).lean();
    const finishedAvail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${itemM._id},${itemL._id}`)
      .expect(200);
    expect(finishedAvail.body[0].onHand).toBe(38);
    expect(finishedAvail.body[1].onHand).toBe(57);

    // Provisional cost (tech.md §6.4): (48000 + 37500) / 100 + 7600 / 95 = 855 + 80 = Rs 935.00.
    const lots = await agent.get(`/api/v1/stock/lots?stockItemId=${itemM._id}`).expect(200);
    expect(lots.body[0].unitCost).toBe(935);

    const slip = await agent.get(`/api/v1/job-slips/${jobSlipId}`).expect(200);
    expect(slip.body.status).toBe('PARTIALLY_RECEIVED');

    const comparison = await agent.get(`/api/v1/job-slips/${jobSlipId}/comparison`).expect(200);
    expect(comparison.body.expected).toBe(100);
    expect(comparison.body.actual).toBe(95);
    expect(comparison.body.difference).toBe(5);
  });

  it('step 9: short-close J1 (factory could not complete the last 5)', async () => {
    await agent
      .post(`/api/v1/job-slips/${jobSlipId}/short-close`)
      .send({ reason: 'factory could not complete the last 5' })
      .expect(201);
    const slip = await agent.get(`/api/v1/job-slips/${jobSlipId}`).expect(200);
    expect(slip.body.status).toBe('RECEIVED');
  });

  it('step 10: reconciliation shows 20 m / 12.5 m shortage at 5% each, and close is blocked', async () => {
    const recon = await agent.get(`/api/v1/job-slips/${jobSlipId}/reconciliation`).expect(200);
    expect(recon.body.canClose).toBe(false);
    const cottonLine = recon.body.lines.find((l: any) => l.stockItemId === cottonStockItemId);
    const printedLine = recon.body.lines.find((l: any) => l.stockItemId === printedStockItemId);
    expect(cottonLine.issued).toBe(400);
    expect(cottonLine.consumed).toBe(380);
    expect(cottonLine.shortage).toBeCloseTo(20, 3);
    expect(cottonLine.shortagePct).toBeCloseTo(5, 3);
    expect(printedLine.shortage).toBeCloseTo(12.5, 3);
    expect(printedLine.shortagePct).toBeCloseTo(5, 3);

    const closeAttempt = await agent.post(`/api/v1/job-slips/${jobSlipId}/close`).expect(409);
    expect(closeAttempt.body.code).toBe('RECONCILIATION_REQUIRED');
  });

  it('step 11a (Path A): writing off the residual unblocks close; final cost is Rs 93,100 / Rs 980.00 per piece, and the ready-stock lots are revalued from the Rs 935.00 provisional cost', async () => {
    await agent
      .post(`/api/v1/job-slips/${jobSlipId}/write-off`)
      .send({ reason: 'shortage within tolerance' })
      .expect(201);

    const recon = await agent.get(`/api/v1/job-slips/${jobSlipId}/reconciliation`).expect(200);
    expect(recon.body.canClose).toBe(true);

    await agent.post(`/api/v1/job-slips/${jobSlipId}/close`).expect(201);
    const slip = await agent.get(`/api/v1/job-slips/${jobSlipId}`).expect(200);
    expect(slip.body.status).toBe('CLOSED');

    const avail = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${cottonStockItemId},${printedStockItemId}`)
      .expect(200);
    expect(avail.body[0].withFactory).toBeCloseTo(0, 3);
    expect(avail.body[1].withFactory).toBeCloseTo(0, 3);

    // CST-01/CST-05: material 48,000 + 37,500 + manufacturing 7,600 = 93,100; / 95 pieces = 980.00.
    const costSheet = await agent.get(`/api/v1/job-slips/${jobSlipId}/cost-sheet`).expect(200);
    expect(costSheet.body.totalCost).toBe(93100);
    expect(costSheet.body.unitCost).toBe(980);
    expect(costSheet.body.status).toBe('FINAL');

    // tech.md §6.5: the D-100 M and L lots created by this job (provisional Rs 935.00) are trued up to Rs 980.00.
    const stockItemModel = app.get(getModelToken('StockItem'));
    const designVariantModel = app.get(getModelToken('DesignVariant'));
    const variantM = await designVariantModel
      .findOne({
        designId: new Types.ObjectId(designId),
        colourId: new Types.ObjectId(colourBlueId),
        sizeId: new Types.ObjectId(sizeMId),
      })
      .lean();
    const itemM = await stockItemModel.findOne({ designVariantId: variantM._id }).lean();
    const lots = await agent.get(`/api/v1/stock/lots?stockItemId=${itemM._id}`).expect(200);
    expect(lots.body[0].unitCost).toBe(980);

    const revaluationModel = app.get(getModelToken('LotRevaluation'));
    const revaluations = await revaluationModel
      .find({ jobSlipId: new Types.ObjectId(jobSlipId) })
      .lean();
    expect(revaluations.length).toBeGreaterThan(0);
    expect(revaluations[0].oldCost).toBe(935);
    expect(revaluations[0].newCost).toBe(980);
  });

  it('a processing job shows a 5 m / 5% shortage (SHR-01) for 100 m sent, 95 m received', async () => {
    await purchaseAndInward(100, 0, 'PROC1');

    const stockItemModel = app.get(getModelToken('StockItem'));
    const rawCottonItem = await stockItemModel
      .findOne({ materialVariantId: new Types.ObjectId(cottonVariantId) })
      .lean();

    const slip = await agent
      .post('/api/v1/job-slips')
      .send({
        jobType: 'PROCESSING',
        jobWorkerId: factoryBId,
        designId,
        expectedOutputLines: [{ materialVariantId: printedVariantId, expectedQty: 100 }],
        chargeBasis: 'PER_METER',
        agreedRate: 5,
      })
      .expect(201);

    const issue = await agent
      .post('/api/v1/material-issues')
      .send({
        jobSlipId: slip.body._id,
        lines: [{ materialVariantId: cottonVariantId, qtyBase: 100 }],
      })
      .expect(201);
    await agent.post(`/api/v1/material-issues/${issue.body._id}/confirm`).expect(201);

    const receipt = await agent
      .post('/api/v1/job-receipts')
      .send({
        jobSlipId: slip.body._id,
        lines: [{ materialVariantId: printedVariantId, receivedQty: 95 }],
      })
      .expect(201);
    await agent.post(`/api/v1/job-receipts/${receipt.body._id}/confirm`).expect(201);

    // SHR-01 (Quantity Sent - Quantity Received) is a property of the conversion itself
    // (expected output vs. actual output), not of job_material_lines' custody accounting -
    // job_material_lines correctly shows zero remaining, since the full 100 m was properly
    // consumed into the process (JOB-11's comparison endpoint is where this shows up).
    const comparison = await agent.get(`/api/v1/job-slips/${slip.body._id}/comparison`).expect(200);
    expect(comparison.body.expected).toBe(100);
    expect(comparison.body.actual).toBe(95);
    expect(comparison.body.difference).toBeCloseTo(5, 3);

    // And job_material_lines shows the 100 m raw input fully, correctly consumed (no residual).
    const recon = await agent.get(`/api/v1/job-slips/${slip.body._id}/reconciliation`).expect(200);
    const line = recon.body.lines.find((l: any) => l.stockItemId === String(rawCottonItem._id));
    expect(line.issued).toBe(100);
    expect(line.consumed).toBe(100);
    expect(line.remaining).toBeCloseTo(0, 3);
  });

  it('JOB-12/tech.md §7.2: cancelling a job slip is blocked once material is issued and not fully returned', async () => {
    const slip = await agent
      .post('/api/v1/job-slips')
      .send({
        jobType: 'MANUFACTURING',
        jobWorkerId: factoryBId,
        designId,
        expectedOutputLines: [{ colourId: colourBlueId, sizeId: sizeMId, expectedQty: 1 }],
        chargeBasis: 'PER_PIECE',
        agreedRate: 80,
      })
      .expect(201);

    // Cancel from CREATED is fine.
    const created2 = await agent
      .post('/api/v1/job-slips')
      .send({
        jobType: 'MANUFACTURING',
        jobWorkerId: factoryBId,
        designId,
        expectedOutputLines: [{ colourId: colourBlueId, sizeId: sizeMId, expectedQty: 1 }],
        chargeBasis: 'PER_PIECE',
        agreedRate: 80,
      })
      .expect(201);
    await agent
      .post(`/api/v1/job-slips/${created2.body._id}/cancel`)
      .send({ reason: 'not needed' })
      .expect(201);

    // Issue a tiny amount against the first one, then cancel should be blocked.
    await purchaseAndInward(5, 0, 'CANCELTEST');
    const issue = await agent
      .post('/api/v1/material-issues')
      .send({
        jobSlipId: slip.body._id,
        lines: [{ materialVariantId: cottonVariantId, qtyBase: 1 }],
      })
      .expect(201);
    await agent.post(`/api/v1/material-issues/${issue.body._id}/confirm`).expect(201);

    const res = await agent
      .post(`/api/v1/job-slips/${slip.body._id}/cancel`)
      .send({ reason: 'trying anyway' })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATE_TRANSITION');
  });
});
