import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Declares the permission key(s) a route requires. AUTH-05/tech.md §9.2: the global
 * PermissionsGuard denies any route that has not declared a permission (or been marked
 * @Public explicitly) - see main.ts route audit at start-up.
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
