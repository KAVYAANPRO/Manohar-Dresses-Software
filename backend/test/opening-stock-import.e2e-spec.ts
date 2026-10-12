import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { MaterialCategoriesService } from '../src/master/material-categories.service';
import { ColoursService } from '../src/master/colours.service';
import { MaterialsService } from '../src/master/materials.service';
import { UomsService } from '../src/master/uoms.service';

/** MST-11/A-14: opening-stock CSV import - the go-live prerequisite the stock formula starts from. */
describe('Opening stock CSV import (Phase 1/2 gap closed)', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let cottonVariantId: string;

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
    await agent.post('/api/v1/auth/login').send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' }).expect(200);

    const category = await app.get(MaterialCategoriesService).create({ name: 'Top Fabric' } as any);
    const colourBlue = await app.get(ColoursService).create({ name: 'Blue' } as any);
    const metreUom = await app.get(UomsService).create({ code: 'M', name: 'Metre' } as any);
    const materialsService = app.get(MaterialsService);
    const cotton = await materialsService.create({
      name: 'Cotton Fabric',
      categoryId: String((category as any)._id),
      baseUomId: String((metreUom as any)._id),
    } as any);
    const cottonVariant = await materialsService.createVariant(String((cotton as any)._id), String((colourBlue as any)._id), undefined);
    cottonVariantId = String((cottonVariant as any)._id);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('dry-run rejects an unknown location without posting anything', async () => {
    const csv = `materialVariantId,qty,unitCost,locationCode\n${cottonVariantId},100,120,NOWHERE`;
    const res = await agent.post('/api/v1/imports/opening-stock/dry-run').send({ csv }).expect(201);
    expect(res.body.rejectedRows).toBe(1);
    expect(res.body.validRows).toBe(0);

    const avail = await agent.get(`/api/v1/stock/valuation`).expect(200);
    expect(avail.body.length).toBe(0);
  });

  it('dry-run passes a valid row, and commit posts it as an OPENING lot into the warehouse', async () => {
    const csv = `materialVariantId,qty,unitCost\n${cottonVariantId},250,120.50`;
    const dryRun = await agent.post('/api/v1/imports/opening-stock/dry-run').send({ csv }).expect(201);
    expect(dryRun.body.validRows).toBe(1);
    expect(dryRun.body.rejectedRows).toBe(0);

    const commit = await agent.post('/api/v1/imports/opening-stock/commit').send({ csv }).expect(201);
    expect(commit.body.imported).toBe(1);

    const valuation = await agent.get('/api/v1/stock/valuation').expect(200);
    const row = valuation.body.find((r: any) => r.qty === 250 && r.unitCost === 120.5);
    expect(row).toBeDefined();
    expect(row.locationCode).toBe('MAIN-WH');
  });

  it('commit rejects the whole batch (nothing posted) when any row fails validation', async () => {
    const csv = `materialVariantId,qty,unitCost\n${cottonVariantId},50,100\nnot-a-valid-id,10,100`;
    const res = await agent.post('/api/v1/imports/opening-stock/commit').send({ csv });
    expect(res.status).toBe(422);

    const valuation = await agent.get('/api/v1/stock/valuation').expect(200);
    expect(valuation.body.some((r: any) => r.qty === 50)).toBe(false);
  });
});
