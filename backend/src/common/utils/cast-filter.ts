import { Types } from 'mongoose';

/**
 * Casts named keys of a plain filter object to ObjectId if they are strings. Query-filter
 * casting of a non-_id ObjectId field is not reliable in this environment (see
 * feedback-mongoose-objectid-casting in memory / the note in stock-items.service.ts) -
 * every list()-style method that accepts a caller-supplied filter should run it through this
 * rather than passing the filter straight to `.find()`.
 */
export function castObjectIdFilter<T extends Record<string, unknown>>(
  filter: T,
  keys: string[],
): T {
  const cast = { ...filter } as Record<string, unknown>;
  for (const key of keys) {
    if (typeof cast[key] === 'string') {
      cast[key] = new Types.ObjectId(cast[key] as string);
    }
  }
  return cast as T;
}
