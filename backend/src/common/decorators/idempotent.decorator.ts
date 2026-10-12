import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'idempotent_route';

/**
 * Marks a posting command (issue, receipt, invoice confirm, ...) as safe to retry via an
 * `Idempotency-Key` header. Only routes that opt in pay the extra Mongo round-trip
 * (tech.md §10.2: "every posting command accepts Idempotency-Key").
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
