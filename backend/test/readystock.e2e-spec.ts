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
 * RGS-01 to RGS-03, PKG-01/PKG-02: reuses the prd.md §10 fixtures through step 8 (a confirmed
 * manufacturing receipt), then checks the ready-stock and packing views built on top of it.
 */
describe('Ready stock and packing (Phase 5): RGS-01 to RGS-03, PKG-01/PKG-02', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let packingAgent: ReturnType<typeof request.agent>;
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
  let itemMId: string;
  let itemLId: string;

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
    await usersService.create({
      username: 'packing-user',
      password: 'PackingPass123!',
      principal: 'internal',
      roleKeys: ['PACKING'],
    } as any);

    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);

    packingAgent = request.agent(app.getHttpServer());
    await packingAgent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'packing-user', password: 'PackingPass123!' })
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

    const supplier = await app.get(SuppliersService).create({ name: 'S-RGS' } as any);
    const purchasesService = app.get(PurchasesService);
    const inwardsService = app.get(InwardsService);
    const purchase = await purchasesService.create(
      {
        supplierId: String((supplier as any)._id),
        supplierInvoiceNo: 'INV-RGS',
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
    itemMId = String((await stockItemModel.findOne({ designVariantId: variantM._id }).lean())._id);
    itemLId = String((await stockItemModel.findOne({ designVariantId: variantL._id }).lean())._id);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('RGS-01/RGS-02: lots view shows date received, factory, location, and cost for a privileged caller', async () => {
    const res = await agent.get(`/api/v1/ready-stock/lots?designId=${designId}`).expect(200);
    expect(res.body.length).toBe(2);
    const m = res.body.find((l: any) => l.sizeName === 'M');
    const l = res.body.find((l: any) => l.sizeName === 'L');
    expect(m.qty).toBe(38);
    expect(l.qty).toBe(57);
    expect(m.jobWorkerName).toBe('Factory A');
    expect(m.locationCode).toBe('MAIN-WH');
    expect(m.receivedOn).toBeDefined();
    expect(m.unitCost).toBe(935); // provisional cost at receipt, before any close-time true-up
  });

  it('RGS-03: summary groups design + colour with a size breakdown that sums to 95', async () => {
    const res = await agent.get(`/api/v1/ready-stock/summary?designId=${designId}`).expect(200);
    expect(res.body.length).toBe(1);
    const group = res.body[0];
    expect(group.totalQty).toBe(95);
    const sizeM = group.sizes.find((s: any) => s.sizeName === 'M');
    const sizeL = group.sizes.find((s: any) => s.sizeName === 'L');
    expect(sizeM.qty).toBe(38);
    expect(sizeL.qty).toBe(57);
    expect(group.totalValue).toBeCloseTo(95 * 935, 1);
  });

  it('PKG-02: the Packing role never sees cost/value fields', async () => {
    const res = await packingAgent
      .get(`/api/v1/ready-stock/summary?designId=${designId}`)
      .expect(200);
    expect(res.body[0].totalValue).toBeUndefined();
    const lots = await packingAgent
      .get(`/api/v1/ready-stock/lots?designId=${designId}`)
      .expect(200);
    for (const lot of lots.body) expect(lot.unitCost).toBeUndefined();
  });

  it('PKG-01: packing dashboard shows available/packed/pending, and pack() is bounded by on-hand', async () => {
    const dash = await packingAgent.get('/api/v1/packing/dashboard').expect(200);
    const rowM = dash.body.find((r: any) => r.stockItemId === itemMId);
    expect(rowM.onHand).toBe(38);
    expect(rowM.packedQty).toBe(0);
    expect(rowM.pendingQty).toBe(38);
    expect(rowM.packingStatus).toBe('UNPACKED');

    const overPack = await packingAgent
      .post(`/api/v1/packing/${itemMId}/pack`)
      .send({ qty: 40 })
      .expect(422);
    expect(overPack.body.code).toBe('VALIDATION_FAILED');

    await packingAgent.post(`/api/v1/packing/${itemMId}/pack`).send({ qty: 20 }).expect(201);
    const dash2 = await packingAgent.get('/api/v1/packing/dashboard').expect(200);
    const rowM2 = dash2.body.find((r: any) => r.stockItemId === itemMId);
    expect(rowM2.packedQty).toBe(20);
    expect(rowM2.pendingQty).toBe(18);
    expect(rowM2.packingStatus).toBe('PARTIALLY_PACKED');

    await packingAgent.post(`/api/v1/packing/${itemMId}/pack`).send({ qty: 18 }).expect(201);
    const dash3 = await packingAgent.get('/api/v1/packing/dashboard').expect(200);
    expect(dash3.body.find((r: any) => r.stockItemId === itemMId).packingStatus).toBe(
      'FULLY_PACKED',
    );

    await packingAgent.post(`/api/v1/packing/${itemMId}/unpack`).send({ qty: 38 }).expect(201);
    const dash4 = await packingAgent.get('/api/v1/packing/dashboard').expect(200);
    expect(dash4.body.find((r: any) => r.stockItemId === itemMId).packingStatus).toBe('UNPACKED');
  });
});
