import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { SuppliersService } from '../src/master/suppliers.service';

describe('Idempotency-Key (tech.md §10.2/§10.3: a retry returns the original result, one effect)', () => {
  let ctx: TestContext;
  let app: INestApplication;

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
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('a retried POST with the same Idempotency-Key creates only one record', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);

    const key = 'test-key-123';
    const payload = { name: 'Idempotent Supplier Co' };

    const first = await agent
      .post('/api/v1/suppliers')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);
    const second = await agent
      .post('/api/v1/suppliers')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(201);

    expect(second.body._id).toBe(first.body._id);

    const suppliersService = app.get(SuppliersService);
    const all = await suppliersService.list({ name: 'Idempotent Supplier Co' } as any);
    expect(all.length).toBe(1);
  });

  it('reusing the same key with a different body is rejected', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);

    const key = 'test-key-456';
    await agent
      .post('/api/v1/suppliers')
      .set('Idempotency-Key', key)
      .send({ name: 'Supplier One' })
      .expect(201);

    const conflict = await agent
      .post('/api/v1/suppliers')
      .set('Idempotency-Key', key)
      .send({ name: 'Supplier Two - different body' })
      .expect(422);
    expect(conflict.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});
