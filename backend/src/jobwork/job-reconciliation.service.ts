import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { MaterialReturn, MaterialReturnDocument } from './schemas/material-return.schema';
import { MaterialIssue, MaterialIssueDocument } from './schemas/material-issue.schema';
import {
  StockLedgerEntry,
  StockLedgerDocument,
} from '../inventory/schemas/stock-ledger.schema';
import { roundQty, toDecimal } from '../common/utils/decimal';
import { ProblemException } from '../common/errors/problem.exception';
import { JobworkLookupService } from './jobwork-lookup.service';
import { ShortageTolerancesService } from './shortage-tolerances.service';
import { JobReceiptsService, outputKey } from './job-receipts.service';

const EPS = 0.0005;

export interface MaterialRecon {
  issued: number;
  returned: number;
  consumed: number;
  writtenOff: number;
}

/**
 * prd.md §5.4 (pure, unit-tested):
 *   Shortage   = Issued - Returned - Consumed
 *   Shortage % = Shortage / Issued x 100   (guard Issued = 0)
 *   Remaining  = Issued - Returned - Consumed - WrittenOff  (must be 0 to close)
 */
export function reconcile(m: MaterialRecon, tolerancePct: number) {
  const shortage = roundQty(toDecimal(m.issued).minus(m.returned).minus(m.consumed));
  const shortagePct =
    m.issued > 0 ? roundQty(toDecimal(shortage).dividedBy(m.issued).times(100)) : 0;
  const remaining = roundQty(toDecimal(shortage).minus(m.writtenOff));
  return {
    shortage,
    shortagePct,
    remaining,
    toleranceExceeded: shortagePct > tolerancePct + EPS,
    /** Negative shortage: the factory used less than standard, so leftover must come back (flag). */
    usedLessThanStandard: shortage < -EPS,
  };
}

/** SHR-01: processing shortage (pure). */
export function processingShortage(sent: number, received: number) {
  const shortage = roundQty(toDecimal(sent).minus(received));
  return { shortage, shortagePct: sent > 0 ? roundQty(toDecimal(shortage).dividedBy(sent).times(100)) : 0 };
}

/**
 * JOB-11 (production comparison), SHR-01..SHR-04 and the JOB-12 close gate, as one read model
 * for the reconciliation screen. No writes here: return = material-returns, write-off and close
 * = job-slips endpoints.
 */
@Injectable()
export class JobReconciliationService {
  constructor(
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
    @InjectModel(MaterialReturn.name) private readonly returnModel: Model<MaterialReturnDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    @InjectModel(StockLedgerEntry.name)
    private readonly ledgerModel: Model<StockLedgerDocument>,
    private readonly lookup: JobworkLookupService,
    private readonly tolerances: ShortageTolerancesService,
    private readonly receipts: JobReceiptsService,
  ) {}

  async summary(jobSlipId: string) {
    if (!Types.ObjectId.isValid(jobSlipId)) {
      throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    }
    const slip = await this.slipModel.findById(jobSlipId).lean();
    if (!slip) throw new ProblemException('NOT_FOUND', 404, 'Job slip not found.');
    const slipOid = slip._id as Types.ObjectId;

    const [matLines, receipts, returns, issues, writeOffRows] = await Promise.all([
      this.materialLineModel.find({ jobSlipId: slipOid }).lean(),
      this.receiptModel.find({ jobSlipId: slipOid }).sort({ createdAt: 1 }).lean(),
      this.returnModel.find({ jobSlipId: slipOid }).sort({ createdAt: 1 }).lean(),
      this.issueModel.find({ jobSlipId: slipOid }).sort({ createdAt: 1 }).lean(),
      this.ledgerModel
        .find({ docType: 'JOB_SLIP', docId: slipOid, movementType: 'SHORTAGE_WRITE_OFF' })
        .lean(),
    ]);
    const confirmed = receipts.filter((r) => r.status === 'CONFIRMED');

    const [workers, designs, ptypes, items, lots, colours, sizes, outVariants] = await Promise.all([
      this.lookup.jobWorkers([slip.jobWorkerId]),
      this.lookup.designs([slip.designId]),
      this.lookup.processingTypes([slip.processingTypeId]),
      this.lookup.stockItemMaterials(matLines.map((l) => l.stockItemId)),
      this.lookup.lots(matLines.map((l) => l.lotId)),
      this.lookup.colours(slip.expectedOutputLines.map((l) => l.colourId)),
      this.lookup.sizes(slip.expectedOutputLines.map((l) => l.sizeId)),
      this.lookup.materialVariants(slip.expectedOutputLines.map((l) => l.materialVariantId)),
    ]);
    const design = designs.get(String(slip.designId));
    const resolve = await this.tolerances.resolver();

    // ---- production comparison (JOB-11), per output variant
    const perVariant = new Map<string, any>();
    for (const e of slip.expectedOutputLines) {
      const k = outputKey(e);
      const row = perVariant.get(k) ?? {
        key: k,
        colourId: e.colourId ? String(e.colourId) : undefined,
        sizeId: e.sizeId ? String(e.sizeId) : undefined,
        materialVariantId: e.materialVariantId ? String(e.materialVariantId) : undefined,
        label: e.materialVariantId
          ? (outVariants.get(String(e.materialVariantId))?.name ?? '')
          : `${colours.get(String(e.colourId)) ?? ''} / ${sizes.get(String(e.sizeId)) ?? ''}`,
        expected: 0,
        received: 0,
        accepted: 0,
        rejected: 0,
        damaged: 0,
      };
      row.expected = roundQty(row.expected + e.expectedQty);
      perVariant.set(k, row);
    }
    for (const r of confirmed) {
      for (const l of r.lines) {
        const k = outputKey(l);
        const row = perVariant.get(k) ?? {
          key: k,
          label: k,
          expected: 0,
          received: 0,
          accepted: 0,
          rejected: 0,
          damaged: 0,
        };
        row.received = roundQty(row.received + l.receivedQty);
        row.accepted = roundQty(row.accepted + (l.acceptedQty ?? 0));
        row.rejected = roundQty(row.rejected + (l.rejectedQty ?? 0));
        row.damaged = roundQty(row.damaged + (l.damagedQty ?? 0));
        perVariant.set(k, row);
      }
    }
    const variants = [...perVariant.values()].map((v) => ({
      ...v,
      difference: roundQty(v.received - v.expected),
    }));
    const sum = (f: string) => roundQty(variants.reduce((s, v) => s + (v[f] ?? 0), 0));
    const production = {
      expected: sum('expected'),
      received: sum('received'),
      accepted: sum('accepted'),
      rejected: sum('rejected'),
      damaged: sum('damaged'),
      difference: roundQty(sum('received') - sum('expected')),
      differencePct:
        sum('expected') > 0
          ? roundQty(toDecimal(sum('received') - sum('expected')).dividedBy(sum('expected')).times(100))
          : 0,
      variants,
    };

    // ---- material reconciliation (SHR-02), per custody line (lot) and per material
    const lines = matLines.map((l) => {
      const mv = items.get(String(l.stockItemId));
      const lot = lots.get(String(l.lotId));
      const tol = resolve({
        materialId: mv?.materialId,
        processingTypeId: slip.processingTypeId ? String(slip.processingTypeId) : undefined,
        jobWorkerId: String(slip.jobWorkerId),
      });
      const rec = reconcile(
        { issued: l.qtyIssued, returned: l.qtyReturned, consumed: l.qtyConsumed, writtenOff: l.qtyWrittenOff },
        tol.tolerancePct,
      );
      return {
        jobMaterialLineId: String(l._id),
        stockItemId: String(l.stockItemId),
        lotId: String(l.lotId),
        lotNo: lot?.lotNo,
        materialVariantId: mv?.materialVariantId,
        materialId: mv?.materialId,
        material: mv?.name ?? 'Unknown material',
        uom: mv?.uom ?? '',
        bomRole: l.bomRole,
        issued: l.qtyIssued,
        returned: l.qtyReturned,
        consumed: l.qtyConsumed,
        writtenOff: l.qtyWrittenOff,
        tolerancePct: tol.tolerancePct,
        toleranceSource: tol.source,
        ...rec,
      };
    });

    const byMaterial = new Map<string, any>();
    for (const l of lines) {
      const k = l.materialVariantId ?? l.stockItemId;
      const m = byMaterial.get(k) ?? {
        materialVariantId: l.materialVariantId,
        material: l.material,
        uom: l.uom,
        bomRole: l.bomRole,
        tolerancePct: l.tolerancePct,
        issued: 0,
        returned: 0,
        consumed: 0,
        writtenOff: 0,
      };
      m.issued = roundQty(m.issued + l.issued);
      m.returned = roundQty(m.returned + l.returned);
      m.consumed = roundQty(m.consumed + l.consumed);
      m.writtenOff = roundQty(m.writtenOff + l.writtenOff);
      byMaterial.set(k, m);
    }

    let bomQtyByVariant = new Map<string, number>();
    if (slip.jobType === 'MANUFACTURING') {
      try {
        const bom = await this.receipts.getBomLines(slip as any, null);
        bomQtyByVariant = new Map();
        for (const b of bom) {
          const k = String(b.materialVariantId);
          bomQtyByVariant.set(k, roundQty((bomQtyByVariant.get(k) ?? 0) + b.qtyPerGarmentBase));
        }
      } catch {
        // no BOM: expected-output-from-material is simply not shown
      }
    }
    const materials = [...byMaterial.values()].map((m) => {
      const rec = reconcile(m, m.tolerancePct);
      const bomQty = m.materialVariantId ? bomQtyByVariant.get(m.materialVariantId) : undefined;
      return {
        ...m,
        ...rec,
        bomQtyPerGarment: bomQty,
        // PDF §16: Expected output = Issued / BOM qty (100 m / 2 m = 50 pieces)
        expectedPiecesFromMaterial:
          bomQty && bomQty > 0
            ? Math.floor(toDecimal(m.issued - m.returned).dividedBy(bomQty).toNumber() + EPS)
            : undefined,
        status: Math.abs(rec.remaining) < EPS ? 'RESOLVED' : 'UNRESOLVED',
      };
    });

    // ---- processing (SHR-01)
    let processing: any;
    if (slip.jobType === 'PROCESSING') {
      const sent = roundQty(
        confirmed.reduce((s, r) => s + (r.processingSummary?.sentQty ?? 0), 0),
      );
      const received = roundQty(confirmed.reduce((s, r) => s + r.lines.reduce((a, l) => a + l.receivedQty, 0), 0));
      const issuedNet = roundQty(lines.reduce((s, l) => s + l.issued - l.returned, 0));
      const tol = resolve({
        materialId: lines[0]?.materialId,
        processingTypeId: slip.processingTypeId ? String(slip.processingTypeId) : undefined,
        jobWorkerId: String(slip.jobWorkerId),
      });
      const ps = processingShortage(sent, received);
      processing = {
        issuedNet,
        sent,
        received,
        ...ps,
        tolerancePct: tol.tolerancePct,
        toleranceExceeded: ps.shortagePct > tol.tolerancePct + EPS,
        reasons: confirmed.map((r) => r.shortageReason).filter(Boolean),
      };
    }

    // ---- close gate (JOB-12 / tech.md §7.5)
    const blockers: string[] = [];
    if (slip.status === 'CLOSED') blockers.push('Job is already closed.');
    else if (slip.status === 'CANCELLED') blockers.push('Job is cancelled.');
    else if (slip.status !== 'RECEIVED') {
      blockers.push(
        slip.status === 'PARTIALLY_RECEIVED'
          ? 'Not all expected pieces are received - receive the rest or short-close the job.'
          : `Job is ${slip.status.replace(/_/g, ' ').toLowerCase()} - receive the goods first.`,
      );
    }
    if (receipts.some((r) => r.status === 'DRAFT')) blockers.push('A draft receipt is still open - confirm or cancel it.');
    if (issues.some((i) => i.status === 'DRAFT')) blockers.push('A draft material issue is still open - confirm or cancel it.');
    if (returns.some((r) => r.status === 'DRAFT')) blockers.push('A draft material return is still open - confirm or cancel it.');
    const unresolved = materials.filter((m) => m.status === 'UNRESOLVED');
    if (unresolved.length) {
      blockers.push(
        `${unresolved.length} material(s) still in custody: ` +
          unresolved.map((m) => `${m.material} ${m.remaining} ${m.uom}`).join(', ') +
          ' - return or write off.',
      );
    }

    const worker = workers.get(String(slip.jobWorkerId));
    return {
      jobSlipId: String(slip._id),
      jobSlipNo: slip.docNo,
      jobType: slip.jobType,
      status: slip.status,
      jobWorkerId: String(slip.jobWorkerId),
      jobWorkerName: worker?.name,
      designId: String(slip.designId),
      designNo: design?.designNo,
      designName: design?.name,
      processingType: slip.processingTypeId ? ptypes.get(String(slip.processingTypeId)) : undefined,
      expectedCompletionDate: slip.expectedCompletionDate,
      closedAt: slip.closedAt,
      production,
      garmentShortfall:
        slip.jobType === 'MANUFACTURING' ? roundQty(production.expected - production.received) : undefined,
      processing,
      materials,
      lines,
      returns: returns.map((r) => ({
        _id: String(r._id),
        docNo: r.docNo,
        docDate: r.docDate,
        status: r.status,
        qty: roundQty(r.lines.reduce((s, l) => s + l.qtyBase, 0)),
        notes: r.notes,
      })),
      writeOffs: writeOffRows.map((w) => ({
        stockItemId: String(w.stockItemId),
        material: items.get(String(w.stockItemId))?.name,
        qty: w.qty,
        reason: w.reason,
        postedAt: w.postedAt,
      })),
      receipts: receipts.map((r) => ({
        _id: String(r._id),
        docNo: r.docNo,
        docDate: r.docDate,
        status: r.status,
        received: roundQty(r.lines.reduce((s, l) => s + l.receivedQty, 0)),
        accepted: roundQty(r.lines.reduce((s, l) => s + (l.acceptedQty ?? 0), 0)),
        warnings: r.warnings ?? [],
      })),
      issues: issues.map((i) => ({
        _id: String(i._id),
        docNo: i.docNo,
        docDate: i.docDate,
        status: i.status,
        qty: roundQty(i.lines.reduce((s, l) => s + l.qtyBase, 0)),
        acknowledgedAt: i.acknowledgedAt,
        discrepancyNote: i.discrepancyNote,
      })),
      canClose: blockers.length === 0,
      blockers,
      flags: [
        ...materials
          .filter((m) => m.usedLessThanStandard)
          .map((m) => `${m.material}: factory used ${Math.abs(m.shortage)} ${m.uom} less than standard - check the leftover is returned.`),
        ...materials
          .filter((m) => m.toleranceExceeded)
          .map((m) => `${m.material}: shortage ${m.shortagePct}% exceeds tolerance ${m.tolerancePct}% - write-off needs approval.`),
        ...(processing?.toleranceExceeded
          ? [`Processing shortage ${processing.shortagePct}% exceeds tolerance ${processing.tolerancePct}%.`]
          : []),
      ],
    };
  }
}
