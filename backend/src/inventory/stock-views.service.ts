import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import { roundMoney, roundQty } from '../common/utils/decimal';

/** Human-readable description of one stock item (raw material variant or finished design variant). */
export interface ItemLabel {
  stockItemId: string;
  kind: string;
  name: string;
  materialId?: string;
  materialName?: string;
  materialVariantId?: string;
  designVariantId?: string;
  designNo?: string;
  colourName?: string;
  sizeName?: string;
  categoryName?: string;
  uomId?: string;
  uomCode?: string;
  minStockQty?: number;
}

/**
 * docType (as written on ledger rows) -> the collection holding that document, so the ledger
 * view can show a document number instead of a raw id. Unknown types fall back to the type.
 */
const DOC_COLLECTIONS: Record<string, string> = {
  INWARD: 'inwards',
  PURCHASE_RETURN: 'purchase_returns',
  STOCK_ADJUSTMENT: 'stock_adjustments',
  MATERIAL_ISSUE: 'material_issues',
  MATERIAL_RETURN: 'material_returns',
  JOB_SLIP: 'job_slips',
  JOB_RECEIPT: 'job_receipts',
  INVOICE: 'invoices',
  SALES_RETURN: 'sales_returns',
  DELIVERY_CHALLAN: 'delivery_challans',
  OPENING_STOCK_IMPORT: 'import_batches',
};

const ids = (xs: unknown[]) =>
  [...new Set(xs.filter(Boolean).map((x) => String(x)))].map((x) => new Types.ObjectId(x));

/**
 * Read-only, screen-shaped stock views (STK-01/04/07/08/09): balances, ledger and lots joined
 * with item / colour / unit / location / user / document names so the frontend does not have
 * to stitch five collections together. Never writes - StockService owns every stock write.
 */
@Injectable()
export class StockViewsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  private col(name: string) {
    return this.connection.collection(name);
  }

  async describeItems(stockItemIds: unknown[]): Promise<Map<string, ItemLabel>> {
    const items = await this.col('stock_items')
      .find({ _id: { $in: ids(stockItemIds) } })
      .toArray();
    const mvs = await this.col('material_variants')
      .find({ _id: { $in: ids(items.map((i) => i.materialVariantId)) } })
      .toArray();
    const dvs = await this.col('design_variants')
      .find({ _id: { $in: ids(items.map((i) => i.designVariantId)) } })
      .toArray();
    const materials = await this.col('materials')
      .find({ _id: { $in: ids(mvs.map((v) => v.materialId)) } })
      .toArray();
    const designs = await this.col('designs')
      .find({ _id: { $in: ids(dvs.map((v) => v.designId)) } })
      .toArray();
    const colours = await this.col('colours')
      .find({ _id: { $in: ids([...mvs.map((v) => v.colourId), ...dvs.map((v) => v.colourId)]) } })
      .toArray();
    const sizes = await this.col('sizes')
      .find({ _id: { $in: ids(dvs.map((v) => v.sizeId)) } })
      .toArray();
    const cats = await this.col('material_categories')
      .find({ _id: { $in: ids(materials.map((m) => m.categoryId)) } })
      .toArray();
    const uoms = await this.col('uoms')
      .find({ _id: { $in: ids(items.map((i) => i.baseUomId)) } })
      .toArray();

    const byId = <T extends { _id: unknown }>(xs: T[]) => new Map(xs.map((x) => [String(x._id), x]));
    const mvMap = byId(mvs);
    const dvMap = byId(dvs);
    const matMap = byId(materials);
    const desMap = byId(designs);
    const colMap = byId(colours);
    const sizeMap = byId(sizes);
    const catMap = byId(cats);
    const uomMap = byId(uoms);

    const out = new Map<string, ItemLabel>();
    for (const item of items) {
      const uom = uomMap.get(String(item.baseUomId));
      const label: ItemLabel = {
        stockItemId: String(item._id),
        kind: item.kind,
        name: 'Unknown item',
        uomId: item.baseUomId ? String(item.baseUomId) : undefined,
        uomCode: uom?.code,
        minStockQty: item.minStockQty ?? undefined,
      };
      if (item.materialVariantId) {
        const mv = mvMap.get(String(item.materialVariantId));
        const mat = mv ? matMap.get(String(mv.materialId)) : undefined;
        const colour = mv ? colMap.get(String(mv.colourId)) : undefined;
        label.materialVariantId = String(item.materialVariantId);
        label.materialId = mat ? String(mat._id) : undefined;
        label.materialName = mat?.name;
        label.colourName = colour?.name;
        label.categoryName = mat ? catMap.get(String(mat.categoryId))?.name : undefined;
        label.name = [mat?.name ?? 'Material', colour?.name].filter(Boolean).join(' - ');
        if (mat?.minStockQty !== undefined && mat?.minStockQty !== null) {
          label.minStockQty = mat.minStockQty;
        }
      } else if (item.designVariantId) {
        const dv = dvMap.get(String(item.designVariantId));
        const des = dv ? desMap.get(String(dv.designId)) : undefined;
        label.designVariantId = String(item.designVariantId);
        label.designNo = des?.designNo;
        label.colourName = dv ? colMap.get(String(dv.colourId))?.name : undefined;
        label.sizeName = dv ? sizeMap.get(String(dv.sizeId))?.name : undefined;
        label.name = [des ? `${des.designNo} ${des.name}` : 'Design', label.colourName, label.sizeName]
          .filter(Boolean)
          .join(' - ');
      }
      out.set(String(item._id), label);
    }
    return out;
  }

  private async locationMap() {
    const locs = await this.col('stock_locations').find({}).toArray();
    return new Map(locs.map((l) => [String(l._id), l]));
  }

  /**
   * STK-04 / STK-08: one row per lot x physical location with a non-zero balance, plus a
   * per-item summary (on hand at warehouse, with factory, in quarantine, low-stock flag).
   */
  async overview(filter: { kind?: string; stockItemId?: string; locationId?: string } = {}) {
    const itemQuery: Record<string, unknown> = {};
    if (filter.kind) itemQuery.kind = filter.kind;
    if (filter.stockItemId) itemQuery._id = new Types.ObjectId(filter.stockItemId);
    const items = await this.col('stock_items').find(itemQuery).toArray();
    const itemIds = items.map((i) => i._id);

    const balQuery: Record<string, unknown> = { stockItemId: { $in: itemIds }, qty: { $ne: 0 } };
    if (filter.locationId) balQuery.locationId = new Types.ObjectId(filter.locationId);
    const balances = await this.col('stock_balances').find(balQuery).toArray();
    const locs = await this.locationMap();
    const lots = await this.col('stock_lots')
      .find({ _id: { $in: ids(balances.map((b) => b.lotId)) } })
      .toArray();
    const lotMap = new Map(lots.map((l) => [String(l._id), l]));
    const suppliers = await this.col('suppliers')
      .find({ _id: { $in: ids(lots.map((l) => l.supplierId)) } })
      .toArray();
    const supMap = new Map(suppliers.map((s) => [String(s._id), s]));
    const labels = await this.describeItems(itemIds);

    const rows = [];
    const summary = new Map<
      string,
      ItemLabel & {
        onHand: number;
        withFactory: number;
        quarantined: number;
        value: number;
        lotCount: number;
        lowStock: boolean;
      }
    >();
    for (const item of items) {
      const label = labels.get(String(item._id))!;
      summary.set(String(item._id), {
        ...label,
        onHand: 0,
        withFactory: 0,
        quarantined: 0,
        value: 0,
        lotCount: 0,
        lowStock: false,
      });
    }

    for (const b of balances) {
      const loc = locs.get(String(b.locationId));
      if (!loc || String(loc.kind).startsWith('VIRTUAL')) continue;
      const lot = lotMap.get(String(b.lotId));
      const label = labels.get(String(b.stockItemId));
      const qty = roundQty(b.qty);
      const unitCost = lot?.unitCost ?? 0;
      rows.push({
        id: String(b._id),
        stockItemId: String(b.stockItemId),
        ...label,
        lotId: String(b.lotId),
        lotNo: lot?.lotNo,
        receivedOn: lot?.receivedOn ?? b.receivedOn,
        supplierName: lot?.supplierId ? supMap.get(String(lot.supplierId))?.name : undefined,
        locationId: String(loc._id),
        locationCode: loc.code,
        locationName: loc.name,
        locationKind: loc.kind,
        qty,
        unitCost,
        value: roundMoney(qty * unitCost),
      });
      const s = summary.get(String(b.stockItemId));
      if (s) {
        if (loc.kind === 'WAREHOUSE') s.onHand += qty;
        if (loc.kind === 'FACTORY_CUSTODY') s.withFactory += qty;
        if (loc.kind === 'QUARANTINE') s.quarantined += qty;
        s.value += qty * unitCost;
        s.lotCount += 1;
      }
    }
    for (const s of summary.values()) {
      s.onHand = roundQty(s.onHand);
      s.withFactory = roundQty(s.withFactory);
      s.quarantined = roundQty(s.quarantined);
      s.value = roundMoney(s.value);
      s.lowStock = s.minStockQty !== undefined && s.minStockQty !== null && s.onHand <= s.minStockQty;
    }
    rows.sort(
      (a, b) =>
        String(a.name).localeCompare(String(b.name)) ||
        new Date(a.receivedOn).getTime() - new Date(b.receivedOn).getTime(),
    );
    return {
      rows,
      items: [...summary.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /** STK-01: the ledger, newest first, with names resolved. Optional filters. */
  async ledger(
    filter: {
      stockItemId?: string;
      lotId?: string;
      locationId?: string;
      docType?: string;
      docId?: string;
      movementType?: string;
      from?: string;
      to?: string;
      limit?: number;
      skip?: number;
    } = {},
  ) {
    const q: Record<string, unknown> = {};
    if (filter.stockItemId) q.stockItemId = new Types.ObjectId(filter.stockItemId);
    if (filter.lotId) q.lotId = new Types.ObjectId(filter.lotId);
    if (filter.docType) q.docType = filter.docType;
    if (filter.docId) q.docId = new Types.ObjectId(filter.docId);
    if (filter.movementType) q.movementType = filter.movementType;
    if (filter.locationId) {
      const l = new Types.ObjectId(filter.locationId);
      q.$or = [{ fromLocationId: l }, { toLocationId: l }];
    }
    if (filter.from || filter.to) {
      const range: Record<string, Date> = {};
      if (filter.from) range.$gte = new Date(filter.from);
      if (filter.to) {
        const to = new Date(filter.to);
        if (/^\d{4}-\d{2}-\d{2}$/.test(filter.to)) to.setUTCHours(23, 59, 59, 999);
        range.$lte = to;
      }
      q.businessDate = range;
    }
    const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
    const col = this.col('stock_ledger');
    const [rows, total] = await Promise.all([
      col
        .find(q)
        .sort({ postedAt: -1, _id: -1 })
        .skip(filter.skip ?? 0)
        .limit(limit)
        .toArray(),
      col.countDocuments(q),
    ]);

    const locs = await this.locationMap();
    const labels = await this.describeItems(rows.map((r) => r.stockItemId));
    const lots = await this.col('stock_lots')
      .find({ _id: { $in: ids(rows.map((r) => r.lotId)) } })
      .toArray();
    const lotMap = new Map(lots.map((l) => [String(l._id), l]));
    const users = await this.col('users')
      .find({ _id: { $in: ids(rows.map((r) => r.postedBy)) } }, { projection: { username: 1, displayName: 1 } })
      .toArray();
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    const docNos = new Map<string, string>();
    const byType = new Map<string, unknown[]>();
    for (const r of rows) {
      if (!byType.has(r.docType)) byType.set(r.docType, []);
      byType.get(r.docType)!.push(r.docId);
    }
    for (const [type, docIds] of byType) {
      const colName = DOC_COLLECTIONS[type];
      if (!colName) continue;
      const docs = await this.col(colName)
        .find({ _id: { $in: ids(docIds) } }, { projection: { docNo: 1, batchNo: 1 } })
        .toArray();
      for (const d of docs) docNos.set(String(d._id), d.docNo ?? d.batchNo ?? String(d._id));
    }

    return {
      total,
      rows: rows.map((r) => {
        const from = locs.get(String(r.fromLocationId));
        const to = locs.get(String(r.toLocationId));
        const fromPhysical = from && !String(from.kind).startsWith('VIRTUAL');
        const toPhysical = to && !String(to.kind).startsWith('VIRTUAL');
        const label = labels.get(String(r.stockItemId));
        const user = userMap.get(String(r.postedBy));
        return {
          id: String(r._id),
          postedAt: r.postedAt,
          businessDate: r.businessDate,
          movementType: r.movementType,
          stockItemId: String(r.stockItemId),
          itemName: label?.name ?? 'Unknown item',
          kind: label?.kind,
          colourName: label?.colourName,
          uomCode: label?.uomCode,
          lotId: String(r.lotId),
          lotNo: lotMap.get(String(r.lotId))?.lotNo,
          qty: r.qty,
          unitCost: r.unitCost,
          /** IN = into a physical location from outside, OUT = the reverse, MOVE = between two physical locations. */
          direction: fromPhysical && toPhysical ? 'MOVE' : toPhysical ? 'IN' : 'OUT',
          fromLocationId: String(r.fromLocationId),
          fromLocation: from?.name ?? from?.code,
          fromLocationCode: from?.code,
          toLocationId: String(r.toLocationId),
          toLocation: to?.name ?? to?.code,
          toLocationCode: to?.code,
          docType: r.docType,
          docId: String(r.docId),
          docNo: docNos.get(String(r.docId)) ?? r.docType,
          reversesId: r.reversesId ? String(r.reversesId) : undefined,
          reason: r.reason,
          postedBy: user?.displayName || user?.username || String(r.postedBy),
        };
      }),
    };
  }

  /** STK-07: every lot with where it came from, how much came in and how much is left, per location. */
  async lots(filter: { stockItemId?: string; kind?: string } = {}) {
    const q: Record<string, unknown> = {};
    if (filter.stockItemId) q.stockItemId = new Types.ObjectId(filter.stockItemId);
    if (filter.kind) {
      const itemIds = await this.col('stock_items').distinct('_id', { kind: filter.kind });
      q.stockItemId = filter.stockItemId
        ? new Types.ObjectId(filter.stockItemId)
        : { $in: itemIds };
    }
    const lots = await this.col('stock_lots').find(q).sort({ receivedOn: -1 }).toArray();
    const lotIds = lots.map((l) => l._id);
    const [balances, origins, labels, locs, suppliers] = await Promise.all([
      this.col('stock_balances')
        .find({ lotId: { $in: lotIds }, qty: { $ne: 0 } })
        .toArray(),
      this.col('stock_ledger')
        .aggregate([
          {
            $match: {
              lotId: { $in: lotIds },
              movementType: {
                $in: ['OPENING', 'INWARD', 'ADJUSTMENT_IN', 'PROCESS_OUTPUT', 'PRODUCTION_RECEIPT'],
              },
            },
          },
          { $group: { _id: '$lotId', qty: { $sum: '$qty' } } },
        ])
        .toArray(),
      this.describeItems(lots.map((l) => l.stockItemId)),
      this.locationMap(),
      this.col('suppliers')
        .find({ _id: { $in: ids(lots.map((l) => l.supplierId)) } })
        .toArray(),
    ]);
    const originQty = new Map(origins.map((o) => [String(o._id), o.qty]));
    const supMap = new Map(suppliers.map((s) => [String(s._id), s]));
    const originDocNos = new Map<string, string>();
    for (const [type, colName] of [
      ['INWARD', 'inwards'],
      ['ADJUSTMENT', 'stock_adjustments'],
      ['PRODUCTION_RECEIPT', 'job_receipts'],
      ['PROCESS_OUTPUT', 'job_receipts'],
    ]) {
      const docIds = lots.filter((l) => l.originDocType === type).map((l) => l.originDocId);
      if (!docIds.length) continue;
      const docs = await this.col(colName)
        .find({ _id: { $in: ids(docIds) } }, { projection: { docNo: 1 } })
        .toArray();
      for (const d of docs) originDocNos.set(String(d._id), d.docNo);
    }

    return lots.map((lot) => {
      const label = labels.get(String(lot.stockItemId));
      const locations = balances
        .filter((b) => String(b.lotId) === String(lot._id))
        .map((b) => ({ loc: locs.get(String(b.locationId)), qty: roundQty(b.qty) }))
        .filter((x) => x.loc && !String(x.loc.kind).startsWith('VIRTUAL'))
        .map((x) => ({
          locationId: String(x.loc!._id),
          locationCode: x.loc!.code,
          locationName: x.loc!.name,
          locationKind: x.loc!.kind,
          qty: x.qty,
        }));
      const remaining = roundQty(locations.reduce((s, l) => s + l.qty, 0));
      const status =
        remaining <= 0
          ? 'EXHAUSTED'
          : locations.every((l) => l.locationKind === 'QUARANTINE')
            ? 'QUARANTINE'
            : 'ACTIVE';
      return {
        id: String(lot._id),
        lotId: String(lot._id),
        lotNo: lot.lotNo,
        stockItemId: String(lot.stockItemId),
        ...label,
        receivedOn: lot.receivedOn,
        unitCost: lot.unitCost,
        originDocType: lot.originDocType,
        originDocId: lot.originDocId ? String(lot.originDocId) : undefined,
        originDocNo: lot.originDocId ? originDocNos.get(String(lot.originDocId)) : undefined,
        supplierId: lot.supplierId ? String(lot.supplierId) : undefined,
        supplierName: lot.supplierId ? supMap.get(String(lot.supplierId))?.name : undefined,
        initialQty: roundQty(originQty.get(String(lot._id)) ?? 0),
        remainingQty: remaining,
        locations,
        status,
      };
    });
  }
}
