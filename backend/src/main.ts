import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { assertAllRoutesDeclarePermissions } from './common/startup/route-audit';
import { PinoLoggerService } from './common/logging/pino-logger.service';
import { sanitizeInputMiddleware } from './common/security/sanitize-input';

async function bootstrap() {
  // Body parsing is registered by hand below so the NoSQL-injection sanitiser runs after it.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(PinoLoggerService));

  const config = app.get(ConfigService<AppConfig, true>);

  // The SPA reaches the API through a reverse proxy (Vite preview/dev in this deployment, a load
  // balancer in production). Trust X-Forwarded-For only from the loopback hop so req.ip is the real
  // client - login lockout and rate limiting are keyed on it - while a remote client can't spoof it.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');
  // Flat query strings only: `?a[$ne]=x` must not become a nested object that reaches a Mongo filter.
  app.set('query parser', 'simple');
  app.disable('x-powered-by');

  // NFR-04: security headers (HSTS, no-sniff, frame-deny, etc.) - TLS itself is terminated
  // upstream of this process (load balancer/reverse proxy), not configured here.
  app.use(helmet());
  app.use(cookieParser());
  // Explicit size caps (DoS); file uploads are multipart and have their own limit in UploadsService.
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: false, limit: '1mb' }));
  app.use(sanitizeInputMiddleware);
  // NFR-04: an explicit allowlist (CORS_ORIGINS), never a wildcard - reflecting any origin
  // while credentials:true is enabled would let any website make authenticated requests
  // using a logged-in user's session cookie.
  const corsOrigins = config.get('corsOrigins', { infer: true });
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // Phase 0 exit criterion: refuse to start if any route is missing a permission declaration.
  await assertAllRoutesDeclarePermissions(app);

  const port = config.get('port', { infer: true });
  // HOST=127.0.0.1 keeps the API off the LAN when it is only ever reached through the local proxy.
  await app.listen(port, process.env.HOST ?? '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`garment-erp-api listening on :${port} (${config.get('nodeEnv', { infer: true })})`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
