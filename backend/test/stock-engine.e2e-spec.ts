import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { SuppliersService } from '../src/master/suppliers.service';
import { MaterialCategoriesService } from '../src/master/material-categories.service';
import { ColoursService } from '../src/master/colours.service';
import { MaterialsService } from '../src/master/materials.service';
import { UomsService } from '../src/master/uoms.service';
import { StockItemsService } from '../src/inventory/stock-items.service';
import { StockLot } from '../src/inventory/schemas/stock-lot.schema';
import { StockBalance } from '../src/inventory/schemas/stock-balance.schema';
import {
  StockLedgerEntry,
  StockLedgerDocument,
} from '../src/inventory/schemas/stock-ledger.schema';

describe('Stock engine: purchase -> inward -> ledger (Phase 2 exit criteria)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;

  let materialVariantId: string;
  let metreUomId: string;
  let supplierId: string;

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

    // Master data fixtures, mirroring prd.md §10's Cotton Blue @ Rs120/m.
    const supplier = await app.get(SuppliersService).create({ name: 'S1' } as any);
    supplierId = String((supplier as any)._id);

    const category = await app.get(MaterialCategoriesService).create({ name: 'Top Fabric' } as any);
    const colour = await app.get(ColoursService).create({ name: 'Blue' } as any);
    // This test's database is a fresh in-memory replica set - it has none of seed.ts's
    // starter data, so the base UoM has to be created here rather than looked up.
    const metreUom = await app.get(UomsService).create({ code: 'M', name: 'Metre' } as any);
    metreUomId = String((metreUom as any)._id);

    const materialsService = app.get(MaterialsService);
    const material = await materialsService.create({
      name: 'Cotton Fabric',
      categoryId: String((category as any)._id),
      baseUomId: metreUomId,
    } as any);
    const variant = await materialsService.createVariant(
      String((material as any)._id),
      String((colour as any)._id),
      undefined,
    );
    materialVariantId = String((variant as any)._id);

    await app.get(UomsService).setConversion(String((material as any)._id), metreUomId, 1);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  let purchaseId: string;
  let purchaseLineId: string;
  let stockItemId: string;

  it('BR-01: confirming a purchase does not create stock (stock stays at zero)', async () => {
    const created = await agent
      .post('/api/v1/purchases')
      .send({
        supplierId,
        supplierInvoiceNo: 'INV-P1',
        otherCharges: 0,
        lines: [{ materialVariantId, uomId: metreUomId, qty: 500, rate: 120 }],
      })
      .expect(201);
    purchaseId = created.body._id;
    purchaseLineId = created.body.lines[0]._id;

    const confirmed = await agent.post(`/api/v1/purchases/${purchaseId}/confirm`).expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    expect(confirmed.body.lines[0].landedUnitCost).toBe(120);

    const stockItemsService = app.get(StockItemsService);
    // No stock item exists yet either - it is created lazily by the first inward.
    const items = await stockItemsService.list({ materialVariantId });
    expect(items.length).toBe(0);
  });

  it('INW-03: confirming an inward puts exactly the received quantity into stock at the landed cost', async () => {
    const locationModel = app.get(getModelToken('StockLocation'));
    const warehouse = await locationModel.findOne({ code: 'MAIN-WH' }).lean();

    const inward = await agent
      .post('/api/v1/inwards')
      .send({
        purchaseId,
        locationId: String(warehouse._id),
        lines: [{ purchaseLineId, qty: 500 }],
      })
      .expect(201);

    const confirmed = await agent.post(`/api/v1/inwards/${inward.body._id}/confirm`).expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');

    const stockItemsService = app.get(StockItemsService);
    const [stockItem] = await stockItemsService.list({ materialVariantId });
    stockItemId = String((stockItem as any)._id);

    const availability = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${stockItemId}`)
      .expect(200);
    expect(availability.body[0].onHand).toBe(500);

    const purchaseAfter = await agent.get(`/api/v1/purchases/${purchaseId}`).expect(200);
    expect(purchaseAfter.body.status).toBe('RECEIVED');

    const lots = await agent.get(`/api/v1/stock/lots?stockItemId=${stockItemId}`).expect(200);
    expect(lots.body.length).toBe(1);
    expect(lots.body[0].unitCost).toBe(120);
  });

  it('PUR-02: the same supplier invoice number cannot be entered twice for one supplier', async () => {
    const res = await agent
      .post('/api/v1/purchases')
      .send({
        supplierId,
        supplierInvoiceNo: 'INV-P1',
        lines: [{ materialVariantId, uomId: metreUomId, qty: 10, rate: 120 }],
      })
      .expect(409);
    expect(res.body.code).toBe('DUPLICATE_NUMBER');
  });

  it('PUR-06: cancelling a purchase is blocked while any inward exists against it', async () => {
    const res = await agent
      .post(`/api/v1/purchases/${purchaseId}/cancel`)
      .send({ reason: 'testing' })
      .expect(409);
    expect(res.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('stock_ledger is append-only, even for this application role', async () => {
    const ledgerModel = app.get<Model<StockLedgerDocument>>(getModelToken(StockLedgerEntry.name));
    await expect(ledgerModel.updateOne({}, { $set: { qty: 999999 } })).rejects.toThrow(
      /append-only/,
    );
    await expect(ledgerModel.deleteMany({})).rejects.toThrow(/append-only/);
  });

  it('over-receipt beyond tolerance is blocked (default tolerance is 0%)', async () => {
    // Create a second purchase/line just for this over-receipt check, fully independent of
    // the first so its own remaining-quantity math is easy to reason about.
    const purchase = await agent
      .post('/api/v1/purchases')
      .send({
        supplierId,
        supplierInvoiceNo: 'INV-OVER',
        lines: [{ materialVariantId, uomId: metreUomId, qty: 100, rate: 120 }],
      })
      .expect(201);
    await agent.post(`/api/v1/purchases/${purchase.body._id}/confirm`).expect(201);

    const locationModel = app.get(getModelToken('StockLocation'));
    const warehouse = await locationModel.findOne({ code: 'MAIN-WH' }).lean();

    // INW-01: refused up front when the draft inward is created (confirm re-checks too).
    const res = await agent
      .post('/api/v1/inwards')
      .send({
        purchaseId: purchase.body._id,
        locationId: String(warehouse._id),
        lines: [{ purchaseLineId: purchase.body.lines[0]._id, qty: 150 }],
      })
      .expect(409);
    expect(res.body.code).toBe('OVER_RECEIPT_TOLERANCE_EXCEEDED');
  });

  it('cancelling a confirmed inward reverses the ledger and un-does the received quantity, then the purchase can be cancelled', async () => {
    const purchase = await agent
      .post('/api/v1/purchases')
      .send({
        supplierId,
        supplierInvoiceNo: 'INV-REV',
        lines: [{ materialVariantId, uomId: metreUomId, qty: 50, rate: 120 }],
      })
      .expect(201);
    await agent.post(`/api/v1/purchases/${purchase.body._id}/confirm`).expect(201);

    const locationModel = app.get(getModelToken('StockLocation'));
    const warehouse = await locationModel.findOne({ code: 'MAIN-WH' }).lean();
    const inward = await agent
      .post('/api/v1/inwards')
      .send({
        purchaseId: purchase.body._id,
        locationId: String(warehouse._id),
        lines: [{ purchaseLineId: purchase.body.lines[0]._id, qty: 50 }],
      })
      .expect(201);
    await agent.post(`/api/v1/inwards/${inward.body._id}/confirm`).expect(201);

    const before = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${stockItemId}`)
      .expect(200);

    await agent
      .post(`/api/v1/inwards/${inward.body._id}/cancel`)
      .send({ reason: 'wrong entry' })
      .expect(201);

    const after = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${stockItemId}`)
      .expect(200);
    expect(after.body[0].onHand).toBe(before.body[0].onHand - 50);

    const purchaseAfterCancel = await agent
      .get(`/api/v1/purchases/${purchase.body._id}`)
      .expect(200);
    expect(purchaseAfterCancel.body.status).toBe('CONFIRMED');

    await agent
      .post(`/api/v1/purchases/${purchase.body._id}/cancel`)
      .send({ reason: 'no longer needed' })
      .expect(201);
  });

  it('STK-05: a stock adjustment only affects the ledger once approved', async () => {
    const proposed = await agent
      .post('/api/v1/stock/adjustments')
      .send({
        stockItemId,
        locationId: await currentWarehouseId(app),
        direction: 'IN',
        qty: 5,
        reason: 'found extra cloth',
        unitCost: 100,
      })
      .expect(201);
    expect(proposed.body.status).toBe('PROPOSED');

    const beforeApprove = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${stockItemId}`)
      .expect(200);

    await agent.post(`/api/v1/stock/adjustments/${proposed.body._id}/approve`).expect(201);

    const afterApprove = await agent
      .get(`/api/v1/stock/availability?stockItemIds=${stockItemId}`)
      .expect(200);
    expect(afterApprove.body[0].onHand).toBe(beforeApprove.body[0].onHand + 5);
  });

  it('STK-06: an OUT adjustment beyond what is on hand is refused, not silently clamped', async () => {
    const proposed = await agent
      .post('/api/v1/stock/adjustments')
      .send({
        stockItemId,
        locationId: await currentWarehouseId(app),
        direction: 'OUT',
        qty: 999999,
        lotId: await firstLotId(app, stockItemId),
        reason: 'test overshoot',
      })
      .expect(409);
    // Refused at proposal time (a doomed proposal never waits for approval); approve re-checks
    // through StockService.post as well.
    expect(proposed.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('STK-10: reconciliation reports clean after all of the above', async () => {
    const res = await agent.post('/api/v1/stock/reconciliation/run').expect(201);
    expect(res.body.clean).toBe(true);
    // Mongoose defaults an array-typed schema path to [] regardless of what the service
    // passes, so "no differences" is an empty array here, not an absent field.
    expect(res.body.differences ?? []).toEqual([]);
  });

  it('concurrent stock adjustment approvals never oversell a lot (no negative balance, no lost update)', async () => {
    const locationId = await currentWarehouseId(app);
    const lotId = await firstLotId(app, stockItemId);
    const available = await lotBalanceAt(app, lotId, locationId);
    expect(available).toBeGreaterThan(0);

    // Ten concurrent OUT adjustments of 1/10th THIS LOT's available qty each: all ten should
    // succeed, and the resulting balance should be exactly zero - no double-decrement, no
    // negative balance despite the race.
    const chunk = available / 10;
    const proposals = await Promise.all(
      Array.from({ length: 10 }, () =>
        agent
          .post('/api/v1/stock/adjustments')
          .send({
            stockItemId,
            locationId,
            direction: 'OUT',
            qty: chunk,
            lotId,
            reason: 'concurrency test',
          })
          .expect(201),
      ),
    );

    const approvals = await Promise.allSettled(
      proposals.map((p) => agent.post(`/api/v1/stock/adjustments/${p.body._id}/approve`)),
    );
    const succeeded = approvals.filter(
      (r) => r.status === 'fulfilled' && (r as any).value.status === 201,
    );
    expect(succeeded.length).toBe(10);

    const afterQty = await lotBalanceAt(app, lotId, locationId);
    expect(afterQty).toBeCloseTo(0, 2);

    // I-2 only forbids a negative balance at a PHYSICAL location - a virtual location (e.g.
    // VIRT-SUPPLIER, VIRT-ADJUSTMENT) is expected to carry a negative running balance by
    // construction (it models an unbounded source/sink), so the check must exclude those.
    const balanceModel = app.get<Model<any>>(getModelToken(StockBalance.name));
    const negativePhysical = await balanceModel.aggregate([
      { $match: { qty: { $lt: -0.0005 } } },
      {
        $lookup: {
          from: 'stock_locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'location',
        },
      },
      { $unwind: '$location' },
      { $match: { 'location.kind': { $not: /^VIRTUAL/ } } },
    ]);
    expect(negativePhysical.length).toBe(0);
  });
});

async function currentWarehouseId(app: INestApplication): Promise<string> {
  const locationModel = app.get(getModelToken('StockLocation'));
  const warehouse = await locationModel.findOne({ code: 'MAIN-WH' }).lean();
  return String(warehouse._id);
}

async function firstLotId(app: INestApplication, stockItemId: string): Promise<string> {
  const lotModel = app.get<Model<any>>(getModelToken(StockLot.name));
  const lots = await lotModel
    .find({ stockItemId: new Types.ObjectId(stockItemId) })
    .sort({ receivedOn: 1 })
    .lean();
  return String(lots[0]._id);
}

async function lotBalanceAt(
  app: INestApplication,
  lotId: string,
  locationId: string,
): Promise<number> {
  const balanceModel = app.get<Model<any>>(getModelToken(StockBalance.name));
  const balance: any = await balanceModel
    .findOne({ lotId: new Types.ObjectId(lotId), locationId: new Types.ObjectId(locationId) })
    .lean();
  return balance?.qty ?? 0;
}
