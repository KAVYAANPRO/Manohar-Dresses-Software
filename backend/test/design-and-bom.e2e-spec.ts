import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { SuppliersService } from '../src/master/suppliers.service';
import { MaterialCategoriesService } from '../src/master/material-categories.service';
import { ColoursService } from '../src/master/colours.service';
import { MaterialsService } from '../src/master/materials.service';
import { UomsService } from '../src/master/uoms.service';
import { ProductCategoriesService } from '../src/master/product-categories.service';
import { SizesService } from '../src/master/sizes.service';
import { PurchasesService } from '../src/purchasing/purchases.service';
import { InwardsService } from '../src/purchasing/inwards.service';
import { AuditLogService } from '../src/audit/audit-log.service';
import { getModelToken } from '@nestjs/mongoose';

describe('Design, BOM, and production requirement (Phase 3 exit criteria)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;

  let materialCategoryId: string;
  let productCategoryId: string;
  let colourBlueId: string;
  let sizeMId: string;
  let sizeLId: string;
  let metreUomId: string;
  let cottonVariantId: string;
  let printedVariantId: string;
  let warehouseId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    await seedRoles(app);

    const usersService = app.get(UsersService);
    await usersService.create({
      username: 'admin',
      password: 'SuperSecret123!',
      principal: 'internal',
      roleKeys: ['SUPER_ADMIN'],
    } as any);
    agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);

    const category = await app.get(MaterialCategoriesService).create({ name: 'Top Fabric' } as any);
    materialCategoryId = String((category as any)._id);
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
      categoryId: materialCategoryId,
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
      categoryId: materialCategoryId,
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
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('DSN-01/PUR-02-style: duplicate design numbers are rejected', async () => {
    const dto = {
      designNo: 'D-DUP',
      name: 'Dup test',
      productCategoryId,
      colourOptions: [colourBlueId],
      sizeOptions: [sizeMId],
    };
    await agent.post('/api/v1/designs').send(dto).expect(201);
    const res = await agent.post('/api/v1/designs').send(dto).expect(409);
    expect(res.body.code).toBe('DUPLICATE_NUMBER');
  });

  it('DSN-02: creating a design generates its colour x size variants (2 sizes x 1 colour = 2 variants)', async () => {
    const created = await agent
      .post('/api/v1/designs')
      .send({
        designNo: 'D-VARIANTS',
        name: 'Variant test',
        productCategoryId,
        colourOptions: [colourBlueId],
        sizeOptions: [sizeMId, sizeLId],
      })
      .expect(201);

    const variants = await agent.get(`/api/v1/designs/${created.body._id}/variants`).expect(200);
    expect(variants.body.length).toBe(2);
  });

  it("DSN-05: the PDF's own example - 2 m per garment x 50 garments = 100 m", async () => {
    const design = await agent
      .post('/api/v1/designs')
      .send({
        designNo: 'D-SIMPLE',
        name: 'Simple one-line BOM',
        productCategoryId,
        colourOptions: [colourBlueId],
        sizeOptions: [sizeMId],
      })
      .expect(201);

    await agent
      .post(`/api/v1/designs/${design.body._id}/bom`)
      .send({
        lines: [
          {
            role: 'Top',
            materialVariantId: cottonVariantId,
            qtyPerGarmentBase: 2,
            allowancePct: 0,
          },
        ],
      })
      .expect(201);

    const req = await agent
      .get(`/api/v1/designs/${design.body._id}/requirements?qty=50`)
      .expect(200);
    expect(req.body.lines[0].requiredQtyBase).toBe(100);
    expect(req.body.byMaterial[0].requiredQtyBase).toBe(100);
  });

  it('DSN-05: allowance percentage is applied correctly', async () => {
    const design = await agent
      .post('/api/v1/designs')
      .send({
        designNo: 'D-ALLOWANCE',
        name: 'Allowance test',
        productCategoryId,
        colourOptions: [colourBlueId],
        sizeOptions: [sizeMId],
      })
      .expect(201);

    await agent
      .post(`/api/v1/designs/${design.body._id}/bom`)
      .send({
        lines: [
          {
            role: 'Top',
            materialVariantId: cottonVariantId,
            qtyPerGarmentBase: 10,
            allowancePct: 10,
          },
        ],
      })
      .expect(201);

    // 10 garments x 10 m/garment x 1.10 (10% allowance) = 110 m
    const req = await agent
      .get(`/api/v1/designs/${design.body._id}/requirements?qty=10`)
      .expect(200);
    expect(req.body.lines[0].requiredQtyBase).toBe(110);
  });

  it('DSN-06: a rate change is visible in the audit log with previous and new values', async () => {
    const design = await agent
      .post('/api/v1/designs')
      .send({
        designNo: 'D-RATE',
        name: 'Rate test',
        productCategoryId,
        colourOptions: [colourBlueId],
        sizeOptions: [sizeMId],
        defaultSellingRate: 1000,
      })
      .expect(201);

    await agent.post(`/api/v1/designs/${design.body._id}/rate`).send({ rate: 1400 }).expect(201);

    const auditLogService = app.get(AuditLogService);
    const rows = await auditLogService.forEntity('Design', design.body._id);
    const rateChangeRow = rows.find(
      (r: any) => r.before?.defaultSellingRate === 1000 && r.after?.defaultSellingRate === 1400,
    );
    expect(rateChangeRow).toBeDefined();

    const history = await agent.get(`/api/v1/designs/${design.body._id}/rate-history`).expect(200);
    expect(history.body.length).toBe(2);
    expect(history.body[0].rate).toBe(1400);
  });

  it('DSN-04: editing a BOM creates a new version, and an existing production order keeps its old snapshot', async () => {
    // Seed enough stock that the requirement check can genuinely pass, mirroring prd.md §10
    // step 3 (500 m cotton / 300 m printed purchased and inwarded before this design is used).
    const supplier = await app.get(SuppliersService).create({ name: 'S1' } as any);
    const purchasesService = app.get(PurchasesService);
    const inwardsService = app.get(InwardsService);
    const usersService = app.get(UsersService);
    const [adminUser] = await usersService.list({ username: 'admin' } as any);
    const actorId = String((adminUser as any)._id);

    const purchase = await purchasesService.create(
      {
        supplierId: String((supplier as any)._id),
        lines: [
          { materialVariantId: cottonVariantId, uomId: metreUomId, qty: 500, rate: 120 },
          { materialVariantId: printedVariantId, uomId: metreUomId, qty: 300, rate: 150 },
        ],
      } as any,
      actorId,
    );
    await purchasesService.confirm(String((purchase as any)._id), actorId);
    const inward = await inwardsService.create(
      {
        purchaseId: String((purchase as any)._id),
        locationId: warehouseId,
        lines: [
          { purchaseLineId: String((purchase as any).lines[0]._id), qty: 500 },
          { purchaseLineId: String((purchase as any).lines[1]._id), qty: 300 },
        ],
      } as any,
      actorId,
    );
    await inwardsService.confirm(String((inward as any)._id), actorId);

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
    const designId = design.body._id;

    // prd.md §10 fixture: top 2.0 m + bottom 2.0 m (both cotton), dupatta 2.5 m (printed).
    const bomV1 = await agent
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
    expect(bomV1.body.versionNo).toBe(1);

    // Step 3 of the scenario: 100 garments (M 40, L 60) -> cotton 400 m, printed 250 m, stock check passes.
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
    const cottonReq = order.body.requirements
      .filter((l: any) => l.materialVariantId === cottonVariantId)
      .reduce((sum: number, l: any) => sum + l.requiredQtyBase, 0);
    const printedReq = order.body.requirements
      .filter((l: any) => l.materialVariantId === printedVariantId)
      .reduce((sum: number, l: any) => sum + l.requiredQtyBase, 0);
    expect(cottonReq).toBe(400);
    expect(printedReq).toBe(250);
    expect(order.body.bomVersionId).toBe(bomV1.body._id);

    // Now edit the BOM (DSN-04): a new version, the old one is superseded.
    const bomV2 = await agent
      .post(`/api/v1/designs/${designId}/bom`)
      .send({
        lines: [
          {
            role: 'Top',
            materialVariantId: cottonVariantId,
            qtyPerGarmentBase: 3,
            allowancePct: 0,
          },
        ],
      })
      .expect(201);
    expect(bomV2.body.versionNo).toBe(2);

    const current = await agent.get(`/api/v1/designs/${designId}/bom`).expect(200);
    expect(current.body._id).toBe(bomV2.body._id);

    // The existing production order's snapshot is untouched by the BOM edit.
    const orderAfter = await agent.get(`/api/v1/production-orders/${order.body._id}`).expect(200);
    expect(orderAfter.body.bomVersionId).toBe(bomV1.body._id);
    const cottonReqAfter = orderAfter.body.requirements
      .filter((l: any) => l.materialVariantId === cottonVariantId)
      .reduce((sum: number, l: any) => sum + l.requiredQtyBase, 0);
    expect(cottonReqAfter).toBe(400);
  });
});
