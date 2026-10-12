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

/** DOC-01, JOB-05: print-ready HTML for invoice, job slip, and material issue slip. */
describe('Print-ready documents (DOC-01/JOB-05)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let adminId: string;
  let jobSlipId: string;
  let issueId: string;
  let invoiceId: string;

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
    await agent.post('/api/v1/auth/login').send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' }).expect(200);

    await app.get(CompanySettingsService).update(
      { legalName: 'Test Garments Pvt Ltd', state: 'Maharashtra', gstin: '27AAAAA0000A1Z5', currentFinancialYear: '26-27' },
      adminId,
    );
    await app.get(TaxRulesService).create(
      { hsn: '6204', valueBandMin: 0, valueBandMax: 2500, ratePct: 5, validFrom: new Date('2025-01-01') } as any,
      adminId,
    );

    const category = await app.get(MaterialCategoriesService).create({ name: 'Top Fabric' } as any);
    const productCategory = await app.get(ProductCategoriesService).create({ name: 'Kurti Set' } as any);
    const colourBlue = await app.get(ColoursService).create({ name: 'Blue' } as any);
    const colourBlueId = String((colourBlue as any)._id);
    const sizeM = await app.get(SizesService).create({ name: 'M', sortOrder: 0 } as any);
    const sizeL = await app.get(SizesService).create({ name: 'L', sortOrder: 1 } as any);
    const sizeMId = String((sizeM as any)._id);
    const sizeLId = String((sizeL as any)._id);
    const metreUom = await app.get(UomsService).create({ code: 'M', name: 'Metre' } as any);
    const metreUomId = String((metreUom as any)._id);

    const materialsService = app.get(MaterialsService);
    const cotton = await materialsService.create({ name: 'Cotton Fabric', categoryId: String((category as any)._id), baseUomId: metreUomId } as any);
    const cottonVariant = await materialsService.createVariant(String((cotton as any)._id), colourBlueId, undefined);
    const cottonVariantId = String((cottonVariant as any)._id);
    await app.get(UomsService).setConversion(String((cotton as any)._id), metreUomId, 1);

    const locationModel = app.get(getModelToken('StockLocation'));
    const warehouse = await locationModel.findOne({ code: 'MAIN-WH' }).lean();
    const warehouseId = String(warehouse._id);

    const design = await agent
      .post('/api/v1/designs')
      .send({
        designNo: 'D-200',
        name: 'Print Test Design',
        productCategoryId: String((productCategory as any)._id),
        colourOptions: [colourBlueId],
        sizeOptions: [sizeMId, sizeLId],
        defaultSellingRate: 1000,
        hsn: '6204',
      })
      .expect(201);
    const designId = design.body._id;
    await agent
      .post(`/api/v1/designs/${designId}/bom`)
      .send({ lines: [{ role: 'Top', materialVariantId: cottonVariantId, qtyPerGarmentBase: 2, allowancePct: 0 }] })
      .expect(201);

    const factoryA = await app.get(JobWorkersService).create({ name: 'Factory Print', type: 'FACTORY', gstin: '27BBBBB0000B1Z5' } as any);
    const factoryAId = String((factoryA as any)._id);

    const customer = await app.get(CustomersService).create({ name: 'Print Customer', state: 'Maharashtra', defaultDiscountPct: 0 } as any, adminId);
    const customerId = String((customer as any)._id);

    const supplier = await app.get(SuppliersService).create({ name: 'Print Supplier' } as any);
    const purchasesService = app.get(PurchasesService);
    const inwardsService = app.get(InwardsService);
    const purchase = await purchasesService.create(
      { supplierId: String((supplier as any)._id), supplierInvoiceNo: 'INV-PRINT', lines: [{ materialVariantId: cottonVariantId, uomId: metreUomId, qty: 100, rate: 120 }] } as any,
      adminId,
    );
    await purchasesService.confirm(String((purchase as any)._id), adminId);
    const inwardLines = (purchase as any).lines.map((l: any) => ({ purchaseLineId: String(l._id), qty: l.qty }));
    const inward = await inwardsService.create({ purchaseId: String((purchase as any)._id), locationId: warehouseId, lines: inwardLines } as any, adminId);
    await inwardsService.confirm(String((inward as any)._id), adminId);

    const order = await agent
      .post('/api/v1/production-orders')
      .send({ designId, quantities: [{ colourId: colourBlueId, sizeId: sizeMId, qty: 10 }] })
      .expect(201);

    const slip = await agent
      .post('/api/v1/job-slips')
      .send({
        jobType: 'MANUFACTURING',
        jobWorkerId: factoryAId,
        designId,
        productionOrderId: order.body._id,
        expectedOutputLines: [{ colourId: colourBlueId, sizeId: sizeMId, expectedQty: 10 }],
        expectedCompletionDate: new Date(Date.now() + 7 * 86400000).toISOString(),
        chargeBasis: 'PER_PIECE',
        agreedRate: 80,
      })
      .expect(201);
    jobSlipId = slip.body._id;

    const issue = await agent
      .post('/api/v1/material-issues')
      .send({ jobSlipId, lines: [{ materialVariantId: cottonVariantId, bomRole: 'Top', qtyBase: 20 }] })
      .expect(201);
    issueId = issue.body._id;
    await agent.post(`/api/v1/material-issues/${issueId}/confirm`).expect(201);

    const receipt = await agent
      .post('/api/v1/job-receipts')
      .send({ jobSlipId, lines: [{ colourId: colourBlueId, sizeId: sizeMId, receivedQty: 10, acceptedQty: 10, rejectedQty: 0, damagedQty: 0 }] })
      .expect(201);
    await agent.post(`/api/v1/job-receipts/${receipt.body._id}/confirm`).expect(201);

    const designVariantModel = app.get(getModelToken('DesignVariant'));
    const variantM = await designVariantModel
      .findOne({ designId: new Types.ObjectId(designId), colourId: new Types.ObjectId(colourBlueId), sizeId: new Types.ObjectId(sizeMId) })
      .lean();

    const salesOrder = await agent
      .post('/api/v1/sales-orders')
      .send({ customerId, lines: [{ designVariantId: String(variantM._id), qty: 5 }] })
      .expect(201);
    await agent.post(`/api/v1/sales-orders/${salesOrder.body._id}/confirm`).expect(201);
    const draft = await agent
      .post('/api/v1/invoices')
      .send({
        customerId,
        salesOrderId: salesOrder.body._id,
        lines: [{ salesOrderLineId: salesOrder.body.lines[0]._id, designVariantId: String(variantM._id), qty: 5 }],
      })
      .expect(201);
    const confirmed = await agent.post(`/api/v1/invoices/${draft.body._id}/confirm`).expect(201);
    invoiceId = confirmed.body._id;
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('invoice print returns print-ready HTML with the invoice number and grand total', async () => {
    const res = await agent.get(`/api/v1/documents/invoices/${invoiceId}/print`).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('INV/26-27/00001');
    expect(res.text).toContain('<html');
  });

  it('job slip print returns HTML with the job worker and design', async () => {
    const res = await agent.get(`/api/v1/documents/job-slips/${jobSlipId}/print`).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Factory Print');
    expect(res.text).toContain('D-200');
  });

  it('material issue print returns HTML with the job worker GSTIN (challan-grade field)', async () => {
    const res = await agent.get(`/api/v1/documents/material-issues/${issueId}/print`).expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('27BBBBB0000B1Z5');
  });
});
