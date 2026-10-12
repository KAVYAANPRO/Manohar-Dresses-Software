import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createTestApp, closeTestApp, seedRoles, TestContext } from './utils/test-app';
import { JobWorkersService } from '../src/master/job-workers.service';
import { UsersService } from '../src/identity/users.service';

describe('Party isolation (BR-08, tech.md §9.3) - plan.md Phase 1 exit criterion', () => {
  let ctx: TestContext;
  let app: INestApplication;
  let factoryAId: string;
  let factoryBId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    app = ctx.app;
    await seedRoles(app);

    const jobWorkersService = app.get(JobWorkersService);
    const usersService = app.get(UsersService);

    const factoryA = await jobWorkersService.create({ name: 'Factory A', type: 'FACTORY' } as any);
    const factoryB = await jobWorkersService.create({ name: 'Factory B', type: 'FACTORY' } as any);
    factoryAId = String((factoryA as any)._id);
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

  it('a factory user sees exactly its own job-worker row via /portal/v1/me', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'factory-a-user', password: 'FactoryAPass123!' })
      .expect(200);

    const me = await agent.get('/portal/v1/me').expect(200);
    expect(me.body._id).toBe(factoryAId);
    expect(me.body.name).toBe('Factory A');
  });

  it('requesting another factory by id returns NOT_FOUND, not FORBIDDEN', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'factory-a-user', password: 'FactoryAPass123!' })
      .expect(200);

    const own = await agent.get(`/portal/v1/job-workers/${factoryAId}`).expect(200);
    expect(own.body._id).toBe(factoryAId);

    const other = await agent.get(`/portal/v1/job-workers/${factoryBId}`).expect(404);
    expect(other.body.code).toBe('NOT_FOUND');
  });

  it('an internal user (not party-scoped) is refused on the portal surface', async () => {
    const usersService = app.get(UsersService);
    await usersService.create({
      username: 'internal-prod-user',
      password: 'InternalPass123!',
      principal: 'internal',
      roleKeys: ['PRODUCTION'],
    } as any);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/v1/auth/login')
      .send({ usernameOrMobile: 'internal-prod-user', password: 'InternalPass123!' })
      .expect(200);

    // PRODUCTION has no portal.job.view permission (prd.md §2.2: portal keys are external-only).
    await agent.get('/portal/v1/me').expect(403);
  });
});
