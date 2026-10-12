import { Types } from 'mongoose';
import { findOverReceipts, outputKey, standardConsumption } from './job-receipts.service';
import { processingShortage, reconcile } from './job-reconciliation.service';
import { resolveTolerance } from './shortage-tolerances.service';
import { embeddedProcessing } from '../costing/costing.service';

const oid = () => new Types.ObjectId();

describe('Receiving / reconciliation / costing rules (prd.md §5.4, §5.5)', () => {
  describe('standardConsumption (SHR-02)', () => {
    it('is pieces x BOM qty and ignores the planning allowance', () => {
      const cotton = oid();
      const dupatta = oid();
      const out = standardConsumption(45, [
        { role: 'Top', materialVariantId: cotton, qtyPerGarmentBase: 2, allowancePct: 5 },
        { role: 'Dupatta', materialVariantId: dupatta, qtyPerGarmentBase: 2.5, allowancePct: 0 },
      ]);
      expect(out.get(String(cotton))).toBe(90);
      expect(out.get(String(dupatta))).toBe(112.5);
    });

    it('sums two BOM roles that use the same material', () => {
      const cotton = oid();
      const out = standardConsumption(10, [
        { role: 'Top', materialVariantId: cotton, qtyPerGarmentBase: 2, allowancePct: 0 },
        { role: 'Bottom', materialVariantId: cotton, qtyPerGarmentBase: 1.25, allowancePct: 0 },
      ]);
      expect(out.get(String(cotton))).toBe(32.5);
    });
  });

  describe('findOverReceipts', () => {
    const k = outputKey({ colourId: 'c', sizeId: 'm' });
    it('allows up to expected', () => {
      expect(findOverReceipts(new Map([[k, 30]]), new Map([[k, 10]]), new Map([[k, 20]]), 0)).toEqual([]);
    });
    it('blocks cumulative above expected', () => {
      const over = findOverReceipts(new Map([[k, 30]]), new Map([[k, 10]]), new Map([[k, 21]]), 0);
      expect(over).toEqual([{ key: k, expected: 30, cumulative: 31, allowed: 30 }]);
    });
    it('honours the tolerance %', () => {
      expect(findOverReceipts(new Map([[k, 100]]), new Map(), new Map([[k, 105]]), 5)).toEqual([]);
      expect(findOverReceipts(new Map([[k, 100]]), new Map(), new Map([[k, 106]]), 5)).toHaveLength(1);
    });
    it('treats a variant not on the slip as expected 0', () => {
      const other = outputKey({ colourId: 'c', sizeId: 'xl' });
      expect(findOverReceipts(new Map([[k, 10]]), new Map(), new Map([[other, 1]]), 0)).toHaveLength(1);
    });
  });

  describe('reconcile (§5.4)', () => {
    it('computes shortage, %, remaining', () => {
      const r = reconcile({ issued: 105, returned: 3, consumed: 100, writtenOff: 0 }, 5);
      expect(r).toMatchObject({ shortage: 2, shortagePct: 1.905, remaining: 2, toleranceExceeded: false });
    });
    it('flags above tolerance and negative shortage', () => {
      expect(reconcile({ issued: 100, returned: 0, consumed: 90, writtenOff: 0 }, 5).toleranceExceeded).toBe(true);
      expect(reconcile({ issued: 100, returned: 0, consumed: 102, writtenOff: 0 }, 5).usedLessThanStandard).toBe(true);
    });
    it('guards issued = 0', () => {
      expect(reconcile({ issued: 0, returned: 0, consumed: 0, writtenOff: 0 }, 0).shortagePct).toBe(0);
    });
    it('remaining is 0 after write-off', () => {
      expect(reconcile({ issued: 105, returned: 3, consumed: 100, writtenOff: 2 }, 0).remaining).toBe(0);
    });
  });

  it('processingShortage: PDF §15 100 m sent, 95 m received = 5 m, 5%', () => {
    expect(processingShortage(100, 95)).toEqual({ shortage: 5, shortagePct: 5 });
    expect(processingShortage(0, 0)).toEqual({ shortage: 0, shortagePct: 0 });
  });

  describe('resolveTolerance (SHR-03)', () => {
    const mat = String(oid());
    const party = String(oid());
    const rules = [
      { _id: 'a', tolerancePct: 3 },
      { _id: 'b', materialId: mat, tolerancePct: 4 },
      { _id: 'c', materialId: mat, jobWorkerId: party, tolerancePct: 6 },
    ];
    it('most specific matching rule wins', () => {
      expect(resolveTolerance(rules, { materialId: mat, jobWorkerId: party }, 1).tolerancePct).toBe(6);
      expect(resolveTolerance(rules, { materialId: mat, jobWorkerId: String(oid()) }, 1).tolerancePct).toBe(4);
      expect(resolveTolerance(rules, { materialId: String(oid()) }, 1).tolerancePct).toBe(3);
    });
    it('falls back to the company default', () => {
      expect(resolveTolerance([], { materialId: mat }, 2)).toEqual({ tolerancePct: 2, source: 'COMPANY_DEFAULT' });
    });
  });

  it('embeddedProcessing (CST-05): share of a processed lot that is processing charge', () => {
    // processing job: 10000 material + 1900 processing = 11900; garment job uses 125 m x 62.6316
    expect(embeddedProcessing(7828.95, { totalCost: 11900, processing: 1900, other: 0 })).toBe(1250);
    expect(embeddedProcessing(500, undefined)).toBe(0);
  });
});
