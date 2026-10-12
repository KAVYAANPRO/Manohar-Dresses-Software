import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'is_public_route';

/**
 * Explicit opt-out of authentication (login, health check, ...). Every public route must be
 * listed here and nowhere else, so the set is reviewable in one grep (tech.md §3.4 step 4).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
