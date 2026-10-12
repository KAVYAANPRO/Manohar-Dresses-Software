import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { assertAllRoutesDeclarePermissions } from '../../src/common/startup/route-audit';
import { RolesService } from '../../src/identity/roles.service';
import { DEFAULT_ROLES } from '../../src/identity/roles.seed-data';

export interface TestContext {
  app: INestApplication;
  mongod: MongoMemoryReplSet;
}

export async function createTestApp(): Promise<TestContext> {
  // A single-node replica set: multi-document transactions (JobWorkersService.create, and
  // the stock engine from Phase 2 onward) require one - a standalone mongod cannot do them.
  const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGO_URI = mongod.getUri();
  process.env.COOKIE_SECRET = 'test-cookie-secret-at-least-32-characters-long';
  process.env.NODE_ENV = 'test';
  // Tight throttle window so the throttling test does not need to fire 5+ requests to prove the point.
  process.env.LOGIN_MAX_ATTEMPTS = '3';

  // Imported dynamically, AFTER the env vars above are set: AppModule's @Module() decorator
  // calls ConfigModule.forRoot({ validationSchema }) at class-definition time (i.e. at import
  // time, not lazily), so a static top-level `import { AppModule }` would validate process.env
  // before this function ever runs and fail with "MONGO_URI is required".
  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Exercises the same Phase 0 exit criterion main.ts enforces: no route without a permission.
  await assertAllRoutesDeclarePermissions(app);

  await app.init();
  return { app, mongod };
}

export async function closeTestApp(ctx: TestContext): Promise<void> {
  await ctx.app.close();
  await ctx.mongod.stop();
}

/** Seeds the nine default roles from prd.md §2.2 so tests can log in as any of them. */
export async function seedRoles(app: INestApplication): Promise<void> {
  const rolesService = app.get(RolesService);
  for (const role of DEFAULT_ROLES) {
    await rolesService.create(role.key, role.name, role.permissions);
  }
}
