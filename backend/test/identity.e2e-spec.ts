import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { UsersService } from '../src/identity/users.service';
import { AuditLogService } from '../src/audit/audit-log.service';

describe('Identity (Phase 0/1 exit criteria)', () => {
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
    await usersService.create({
      username: 'packer',
      password: 'PackerSecret123!',
      principal: 'internal',
      roleKeys: ['PACKING'],
    } as any);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('logs in with correct credentials and reads /auth/me', async () => {
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);
    expect(login.body.user.username).toBe('admin');
    expect(login.body.user.isSuperAdmin).toBe(true);

    const me = await agent.get('/api/v1/auth/me').expect(200);
    expect(me.body.user.username).toBe('admin');
  });

  it('rejects wrong password with an identical, generic error (no user enumeration)', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'wrong' })
      .expect(401);
    const noSuchUser = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'nobody', password: 'wrong' })
      .expect(401);
    expect(wrongPassword.body.detail).toBe(noSuchUser.body.detail);
    expect(wrongPassword.body.code).toBe('UNAUTHENTICATED');
  });

  it('denies a route the caller lacks permission for, and allows Super Admin everywhere', async () => {
    const packerAgent = request.agent(app.getHttpServer());
    await packerAgent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'packer', password: 'PackerSecret123!' })
      .expect(200);

    // Packing has no identity.user.manage (prd.md §2.2).
    await packerAgent.get('/api/v1/users').expect(403);

    const adminAgent = request.agent(app.getHttpServer());
    await adminAgent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);
    await adminAgent.get('/api/v1/users').expect(200);
  });

  it('logging out revokes the session immediately', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);
    await agent.get('/api/v1/auth/me').expect(200);
    await agent.post('/api/v1/auth/logout').expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('records an audit row for a master-data write (AUD-01)', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'admin', password: 'SuperSecret123!' })
      .expect(200);

    const created = await agent
      .post('/api/v1/suppliers')
      .send({ name: 'Test Fabric Supplier' })
      .expect(201);

    const auditLogService = app.get(AuditLogService);
    const rows = await auditLogService.forEntity('Supplier', created.body._id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].action).toBe('INSERT');
    expect(rows[0].after?.name).toBe('Test Fabric Supplier');
  });

  // Last: login throttling is keyed by IP as well as username (AUTH-01, tech.md §9.1), so it
  // locks out every subsequent login attempt from this same test client's IP - it must not
  // run before any other test in this file that needs to log in.
  it('throttles repeated failed logins (AUTH-01)', async () => {
    const username = `throttle-target-${Date.now()}`;
    const usersService = app.get(UsersService);
    await usersService.create({
      username,
      password: 'RealPassword123!',
      principal: 'internal',
      roleKeys: ['PACKING'],
    } as any);

    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ usernameOrMobile: username, password: 'wrong' })
        .expect(401);
    }
    // LOGIN_MAX_ATTEMPTS=3 (test-app.ts) - the 4th attempt, even with the RIGHT password, is locked out.
    const locked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: username, password: 'RealPassword123!' })
      .expect(429);
    expect(locked.body.code).toBe('RATE_LIMITED');
  });
});
