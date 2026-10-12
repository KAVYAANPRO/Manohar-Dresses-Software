import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import configuration, { AppConfig } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { ProblemExceptionFilter } from './common/filters/problem.filter';
import { SessionAuthGuard } from './common/guards/session-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { RedactionInterceptor } from './common/redaction/redaction.interceptor';
import { CommonModule } from './common/common.module';
import { AuditModule } from './audit/audit.module';
import { IdentityModule } from './identity/identity.module';
import { MasterModule } from './master/master.module';
import { PortalModule } from './portal/portal.module';
import { InventoryModule } from './inventory/inventory.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { DesignModule } from './design/design.module';
import { JobworkModule } from './jobwork/jobwork.module';
import { CostingModule } from './costing/costing.module';
import { ReadystockModule } from './readystock/readystock.module';
import { SalesModule } from './sales/sales.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { ReportsModule } from './reports/reports.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        uri: config.get('mongoUri', { infer: true }),
      }),
    }),
    // Nightly reconciliation (STK-10) - this Mongo build's substitute for tech.md's
    // Postgres-job-queue (pg-boss) worker; there is no other background-job infra yet.
    ScheduleModule.forRoot(),
    // NFR-04: general API rate limiting, on top of (not instead of) LoginThrottleService's
    // username/IP-specific login lockout - this catches abuse of every other route.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    DiscoveryModule,
    CommonModule,
    AuditModule,
    IdentityModule,
    MasterModule,
    PortalModule,
    InventoryModule,
    PurchasingModule,
    DesignModule,
    JobworkModule,
    CostingModule,
    ReadystockModule,
    SalesModule,
    DashboardsModule,
    ReportsModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ProblemExceptionFilter },
    // Order matters: rate-limit first (cheapest check, rejects abuse before any DB work),
    // then CsrfGuard (needs only the raw cookie, not req.user), then SessionAuthGuard
    // resolves req.user, then PermissionsGuard reads it.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Redaction is registered first so it is the OUTERMOST interceptor: even an idempotent
    // replay of a stored response is stripped of money fields for the current caller.
    { provide: APP_INTERCEPTOR, useClass: RedactionInterceptor },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
