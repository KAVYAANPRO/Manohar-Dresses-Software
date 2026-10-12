import { INestApplication } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Phase 0 exit criterion (plan.md): "A route without a declared permission fails the build
 * or start-up." PermissionsGuard already fails closed at runtime (belt); this is the
 * suspenders - it walks every controller method at boot and refuses to start if any route
 * declares neither @RequirePermissions nor @Public, so the gap is caught in CI/staging
 * before a real request ever hits it.
 */
export async function assertAllRoutesDeclarePermissions(app: INestApplication): Promise<void> {
  const discovery = app.get(DiscoveryService);
  const scanner = app.get(MetadataScanner);
  const reflector = app.get(Reflector);

  const violations: string[] = [];

  for (const wrapper of discovery.getControllers()) {
    const instance = wrapper.instance;
    if (!instance) continue;
    const prototype = Object.getPrototypeOf(instance);
    const methodNames = scanner.getAllMethodNames(prototype);

    for (const methodName of methodNames) {
      const handler = prototype[methodName];

      // Only methods Nest actually registered as an HTTP route handler (i.e. decorated with
      // @Get/@Post/etc, which stamps METHOD_METADATA) count as a "route" here. A plain
      // private helper method (e.g. a DTO-shaping function on a controller) is not routable
      // and would otherwise be wrongly flagged as "missing a permission".
      const isRouteHandler = Reflect.hasMetadata(METHOD_METADATA, handler);
      if (!isRouteHandler) continue;

      const isPublic =
        reflector.get(IS_PUBLIC_KEY, handler) ?? reflector.get(IS_PUBLIC_KEY, instance.constructor);
      const permissions = reflector.get(PERMISSIONS_KEY, handler);

      if (!isPublic && permissions === undefined) {
        violations.push(`${instance.constructor.name}.${methodName}`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      'Startup route audit failed (AUTH-05/AUTH-04). The following routes declare neither ' +
        '@RequirePermissions(...) nor @Public() and would deny every request:\n' +
        violations.map((v) => `  - ${v}`).join('\n'),
    );
  }
}
