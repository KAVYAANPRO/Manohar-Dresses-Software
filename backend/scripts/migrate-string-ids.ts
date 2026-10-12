/**
 * One-off, idempotent data fix: converts reference ids that were stored as 24-hex STRINGS into
 * real ObjectIds wherever the Mongoose schema declares the path as an ObjectId (top level,
 * arrays of ids, and ids inside sub-documents / document arrays at any depth). String ids make
 * `$in`, `$lookup` and equality filters silently miss rows.
 *
 * The schema is the source of truth: every `*.schema.ts` under src/ is loaded and each exported
 * Schema with a `collection` option is walked for ObjectId paths. Values that are not valid
 * 24-hex strings are left untouched and reported. Re-running is a no-op once clean.
 *
 * Usage (reads MONGO_URI from the environment, else from .env; the URI is never printed):
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-string-ids.ts            # dry run
 *   npx ts-node -r tsconfig-paths/register scripts/migrate-string-ids.ts --apply    # write
 *
 * Writes go through the raw driver (no Mongoose hooks), one updateOne per affected document,
 * touching only the converted top-level fields. Take a backup first (scripts/backup.ps1).
 */
import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import mongoose, { Schema, Types } from 'mongoose';

const APPLY = process.argv.includes('--apply');
const HEX24 = /^[0-9a-fA-F]{24}$/;

/** Extra string-stored references outside any schema's ObjectId paths (e.g. a field typed loosely). */
const EXTRA_PATHS: Record<string, string[]> = {
  customers: ['agentId'],
};

function findSchemaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findSchemaFiles(full));
    else if (entry.name.endsWith('.schema.ts')) out.push(full);
  }
  return out;
}

/** Dotted ObjectId paths of a schema, '$' marking an array level: e.g. 'lines.$.materialVariantId'. */
function objectIdPaths(schema: Schema, prefix = ''): string[] {
  const out: string[] = [];
  schema.eachPath((p, type: any) => {
    const full = prefix + p;
    const leaf = p.split('.').pop() ?? p;
    const idLike = /(Id|By)$/.test(leaf) || !!type.options?.ref;
    if (type.instance === 'ObjectId' || type.instance === 'ObjectID') {
      out.push(full);
    } else if (type.instance === 'Mixed' && idLike) {
      // `type: Types.ObjectId` under @nestjs/mongoose degrades to Mixed (see report) - still an id.
      out.push(full);
    } else if (type.$isMongooseDocumentArray && type.schema) {
      out.push(...objectIdPaths(type.schema, `${full}.$.`));
    } else if (type.$isSingleNested && type.schema) {
      out.push(...objectIdPaths(type.schema, `${full}.`));
    } else if (type.instance === 'Array') {
      const caster = type.caster ?? type.$embeddedSchemaType;
      const casterIsId =
        caster &&
        (caster.instance === 'ObjectId' ||
          caster.instance === 'ObjectID' ||
          (caster.instance === 'Mixed' && /Ids$/.test(leaf)));
      if (casterIsId) {
        out.push(`${full}.$`);
      }
    }
  });
  return out;
}

interface Stats {
  converted: number;
  invalid: number;
}

/** Converts in place along `segments`; returns true when anything changed. */
function convertAt(node: any, segments: string[], stats: Stats): boolean {
  if (node === null || node === undefined) return false;
  const [head, ...rest] = segments;
  if (head === '$') {
    if (!Array.isArray(node)) return false;
    let changed = false;
    for (let i = 0; i < node.length; i++) {
      if (rest.length === 0) {
        const v = node[i];
        if (typeof v === 'string') {
          if (HEX24.test(v)) {
            node[i] = new Types.ObjectId(v);
            stats.converted++;
            changed = true;
          } else stats.invalid++;
        }
      } else if (convertAt(node[i], rest, stats)) changed = true;
    }
    return changed;
  }
  if (typeof node !== 'object') return false;
  if (rest.length === 0) {
    const v = node[head];
    if (typeof v === 'string') {
      if (HEX24.test(v)) {
        node[head] = new Types.ObjectId(v);
        stats.converted++;
        return true;
      }
      if (v !== '') stats.invalid++;
    }
    return false;
  }
  return convertAt(node[head], rest, stats);
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI is not set (env or .env).');

  // collection -> set of ObjectId paths (several schema classes may share one collection)
  const byCollection = new Map<string, Set<string>>();
  for (const file of findSchemaFiles(path.join(__dirname, '..', 'src'))) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(file);
    for (const exported of Object.values(mod)) {
      if (!(exported instanceof Schema)) continue;
      const collection = (exported as any).options?.collection as string | undefined;
      if (!collection) continue;
      const set = byCollection.get(collection) ?? new Set<string>();
      for (const p of objectIdPaths(exported)) if (p !== '_id') set.add(p);
      byCollection.set(collection, set);
    }
  }
  for (const [c, paths] of Object.entries(EXTRA_PATHS)) {
    const set = byCollection.get(c) ?? new Set<string>();
    paths.forEach((p) => set.add(p));
    byCollection.set(c, set);
  }

  await mongoose.connect(uri);
  const db = mongoose.connection.db!;
  console.log(`Database: ${db.databaseName}  mode: ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));

  let grandConverted = 0;
  for (const [collection, pathSet] of [...byCollection.entries()].sort()) {
    if (!existing.has(collection) || pathSet.size === 0) continue;
    const paths = [...pathSet];
    // Any document holding a string at one of these paths ('$' levels are implicit in Mongo queries).
    const or = paths.map((p) => ({ [p.replace(/\.\$/g, '')]: { $type: 'string' } }));
    const coll = db.collection(collection);
    const cursor = coll.find({ $or: or });
    const stats: Stats = { converted: 0, invalid: 0 };
    let docs = 0;
    const perPath = new Map<string, number>();
    for await (const doc of cursor) {
      const touched = new Set<string>();
      for (const p of paths) {
        const before = stats.converted;
        if (convertAt(doc, p.split('.'), stats)) touched.add(p.split('.')[0]);
        if (stats.converted > before) perPath.set(p, (perPath.get(p) ?? 0) + stats.converted - before);
      }
      if (touched.size === 0) continue;
      docs++;
      if (APPLY) {
        const $set: Record<string, unknown> = {};
        for (const top of touched) $set[top] = doc[top];
        await coll.updateOne({ _id: doc._id }, { $set });
      }
    }
    if (docs > 0 || stats.invalid > 0) {
      console.log(
        `${collection}: ${docs} document(s), ${stats.converted} id(s) ${APPLY ? 'converted' : 'to convert'}` +
          (stats.invalid ? `, ${stats.invalid} non-hex string value(s) left as-is` : ''),
      );
      for (const [p, n] of perPath) console.log(`    ${p}: ${n}`);
    }
    grandConverted += stats.converted;
  }
  console.log(`Total ids ${APPLY ? 'converted' : 'to convert'}: ${grandConverted}`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
