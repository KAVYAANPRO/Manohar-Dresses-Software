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

/**
 * prd.md §10 step 11b (Path B): instead of writing off the 20 m / 12.5 m residual, the
 * factory returns it, so close's final cost equals the provisional cost (material returned
 * to its original lots at their original rate, nothing trued up) - Rs 88,825 total, Rs 935.00
 * per piece, and CostingService.onJobClosed should find no lot to revalue.
 */
describe('Costing (Phase 5): job close, Path B - return instead of write-off', () => {
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

    const supplier = await app.get(SuppliersService).create({ name: 'S-PathB' } as any);
    const purchasesService = app.get(PurchasesService);
    const inwardsService = app.get(InwardsService);
    const purchase = await purchasesService.create(
      {
        supplierId: String((supplier as any)._id),
        supplierInvoiceNo: 'INV-PathB',
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
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('runs the full Path B scenario and asserts the final cost sheet is Rs 88,825 / Rs 935.00 per piece with no revaluation', async () => {
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
    const productionOrderId = order.body._id;

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

    // CST-01/CST-03: right after the receipt, nothing has been returned yet, so cost = the full
    // issued material (400 m cotton + 250 m printed), same as Path A's eventual total - tech.md
    // §6.3: "Material cost uses (issued - returned), so ... shortage ... stay[s] inside the job's cost."
    const afterReceipt = await agent.get(`/api/v1/job-slips/${jobSlipId}/cost-sheet`).expect(200);
    expect(afterReceipt.body.totalCost).toBe(93100);
    expect(afterReceipt.body.unitCost).toBe(980);
    expect(afterReceipt.body.status).toBe('PROVISIONAL');

    await agent
      .post(`/api/v1/job-slips/${jobSlipId}/short-close`)
      .send({ reason: 'factory could not complete the last 5' })
      .expect(201);

    const recon = await agent.get(`/api/v1/job-slips/${jobSlipId}/reconciliation`).expect(200);
    expect(recon.body.canClose).toBe(false);
    const cottonLine = recon.body.lines.find((l: any) => l.bomRole === 'Top+Bottom');
    const printedLine = recon.body.lines.find((l: any) => l.bomRole === 'Dupatta');
    expect(cottonLine.remaining).toBeCloseTo(20, 3);
    expect(printedLine.remaining).toBeCloseTo(12.5, 3);

    // Path B: return the residual instead of writing it off.
    const returnDoc = await agent
      .post('/api/v1/material-returns')
      .send({
        jobSlipId,
        lines: [
          { materialVariantId: cottonVariantId, lotId: cottonLine.lotId, qtyBase: 20 },
          { materialVariantId: printedVariantId, lotId: printedLine.lotId, qtyBase: 12.5 },
        ],
      })
      .expect(201);
    await agent.post(`/api/v1/material-returns/${returnDoc.body._id}/confirm`).expect(201);

    const reconAfterReturn = await agent
      .get(`/api/v1/job-slips/${jobSlipId}/reconciliation`)
      .expect(200);
    expect(reconAfterReturn.body.canClose).toBe(true);

    // The return already dropped material cost to (380 x 120) + (237.5 x 150) = 81,225, before close.
    const afterReturn = await agent.get(`/api/v1/job-slips/${jobSlipId}/cost-sheet`).expect(200);
    expect(afterReturn.body.totalCost).toBe(88825);
    expect(afterReturn.body.unitCost).toBe(935);
    expect(afterReturn.body.status).toBe('PROVISIONAL');

    await agent.post(`/api/v1/job-slips/${jobSlipId}/close`).expect(201);
    const closed = await agent.get(`/api/v1/job-slips/${jobSlipId}`).expect(200);
    expect(closed.body.status).toBe('CLOSED');

    const finalSheet = await agent.get(`/api/v1/job-slips/${jobSlipId}/cost-sheet`).expect(200);
    expect(finalSheet.body.totalCost).toBe(88825);
    expect(finalSheet.body.unitCost).toBe(935);
    expect(finalSheet.body.status).toBe('FINAL');

    // Returned metres land back in their original lots at their original rate (BR-02 in reverse).
    const avail = await agent
      .get(
        `/api/v1/stock/availability?stockItemIds=${cottonLine.stockItemId},${printedLine.stockItemId}`,
      )
      .expect(200);
    expect(avail.body[0].onHand).toBeCloseTo(120, 3); // 100 left in warehouse + 20 returned
    expect(avail.body[1].onHand).toBeCloseTo(62.5, 3); // 50 left in warehouse + 12.5 returned

    // Provisional cost already equalled final cost, so no lot needed a revaluation entry.
    const revaluationModel = app.get(getModelToken('LotRevaluation'));
    const revaluations = await revaluationModel
      .find({ jobSlipId: new Types.ObjectId(jobSlipId) })
      .lean();
    expect(revaluations.length).toBe(0);
  });
});
