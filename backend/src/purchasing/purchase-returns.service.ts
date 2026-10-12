import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  PurchaseReturn,
  PurchaseReturnDocument,
  PurchaseReturnLine,
} from './schemas/purchase-return.schema';
import { Inward, InwardDocument } from './schemas/inward.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockBalance, StockBalanceDocument } from '../inventory/schemas/stock-balance.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { InwardsService } from './inwards.service';
import { PurchasesService } from './purchases.service';
import { StockService } from '../inventory/stock.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { TransactionService } from '../common/services/transaction.service';
import { roundMoney, roundQty, toDecimal } from '../common/utils/decimal';
import {
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { CreatePurchaseReturnDto } from './dto/purchase-return.dto';
import { assertReturnable } from './purchase-return.rules';

/**
 * PUR-08: Purchase -> Inward -> Inspection -> Return. Stock leaves a physical location to the
 * virtual supplier location as PURCHASE_RETURN rows on the exact lot it came in on (prd §5.2),
 * and the supplier is debited at the lot's landed cost (debit note).
 */
@Injectable()
export class PurchaseReturnsService {
  constructor(
    @InjectModel(PurchaseReturn.name) private readonly model: Model<PurchaseReturnDocument>,
    @InjectModel(Inward.name) private readonly inwardModel: Model<InwardDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @InjectModel(StockBalance.name) private readonly balanceModel: Model<StockBalanceDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    private readonly inwardsService: InwardsService,
    private readonly purchasesService: PurchasesService,
    private readonly stockService: StockService,
    private readonly numberSeries: NumberSeriesService,
    private readonly transactionService: TransactionService,
  ) {}

  list(filter: Record<string, unknown> = {}) {
    const castFilter = { ...filter };
    for (const key of ['supplierId', 'inwardId', 'purchaseId']) {
      if (typeof castFilter[key] === 'string') {
        castFilter[key] = new Types.ObjectId(castFilter[key] as string);
      }
    }
    return this.model.find(castFilter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Purchase return not found.');
    return doc;
  }

  /**
   * What can still go back to the supplier from one confirmed inward: per inward line, the
   * lot, received / already returned / returnable quantities and what is on hand in that lot
   * at the inward's location (or `locationId`).
   */
  async returnable(inwardId: string, locationId?: string) {
    const inward = await this.inwardModel.findById(inwardId).lean();
    if (!inward) throw new ProblemException('NOT_FOUND', 404, 'Inward not found.');
    const locId = locationId ?? String(inward.locationId);
    const lines = [];
    for (const line of inward.lines) {
      const onHand = line.createdLotId
        ? await this.onHand(String(line.createdLotId), locId)
        : 0;
      const lot = line.createdLotId ? await this.lotModel.findById(line.createdLotId).lean() : null;
      const alreadyReturned = line.qtyReturnedBase ?? 0;
      lines.push({
        inwardLineId: String(line._id),
        materialVariantId: String(line.materialVariantId),
        lotId: line.createdLotId ? String(line.createdLotId) : null,
        lotNo: lot?.lotNo ?? null,
        unitCost: line.unitCost ?? lot?.unitCost ?? 0,
        received: line.qtyBase,
        alreadyReturned,
        returnable: roundQty(Math.max(0, line.qtyBase - alreadyReturned)),
        onHand,
        maxReturnQty: roundQty(Math.max(0, Math.min(line.qtyBase - alreadyReturned, onHand))),
      });
    }
    return {
      inwardId: String(inward._id),
      inwardNo: inward.docNo,
      status: inward.status,
      supplierId: String(inward.supplierId),
      purchaseId: String(inward.purchaseId),
      locationId: locId,
      lines,
    };
  }

  async create(dto: CreatePurchaseReturnDto, actorId: string): Promise<PurchaseReturnDocument> {
    const fy = await this.purchasesService.currentFy();
    await this.numberSeries.ensureSeries('PURCHASE_RETURN', fy, 'PRN');
    await this.numberSeries.ensureSeries('DEBIT_NOTE', fy, 'DN');
    return this.transactionService.run(async (session) => {
      const inward = await this.inwardModel.findById(dto.inwardId).session(session).lean();
      if (!inward) throw new ProblemException('NOT_FOUND', 404, 'Inward not found.');
      if (inward.status !== 'CONFIRMED') {
        throw new InvalidStateTransitionException(
          `Only a confirmed inward can be returned (this one is ${inward.status}).`,
        );
      }
      const locationId = dto.locationId ?? String(inward.locationId);
      await this.assertPhysicalLocation(locationId, session);

      const seen = new Set<string>();
      const lines: PurchaseReturnLine[] = [];
      for (const input of dto.lines) {
        if (seen.has(input.inwardLineId)) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            'The same inward line appears twice in this return.',
          );
        }
        seen.add(input.inwardLineId);
        const line = inward.lines.find((l) => String(l._id) === input.inwardLineId);
        if (!line) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            `Inward line ${input.inwardLineId} not found on inward ${inward.docNo}.`,
          );
        }
        if (!line.createdLotId) {
          throw new ProblemException('VALIDATION_FAILED', 422, 'Inward line has no lot.');
        }
        const qty = roundQty(input.qty);
        const lot = await this.lotModel.findById(line.createdLotId).session(session).lean();
        if (!lot) throw new ProblemException('NOT_FOUND', 404, 'Lot not found.');
        assertReturnable({
          label: `Lot ${lot.lotNo}`,
          received: line.qtyBase,
          alreadyReturned: line.qtyReturnedBase ?? 0,
          onHand: await this.onHand(String(lot._id), locationId, session),
          requested: qty,
          lotId: String(lot._id),
          locationId,
        });
        const unitCost = line.unitCost ?? lot.unitCost;
        lines.push({
          inwardLineId: new Types.ObjectId(String(line._id)),
          lotId: new Types.ObjectId(String(lot._id)),
          stockItemId: new Types.ObjectId(String(lot.stockItemId)),
          materialVariantId: new Types.ObjectId(String(line.materialVariantId)),
          qty,
          unitCost,
          amount: roundMoney(toDecimal(qty).times(unitCost)),
        } as unknown as PurchaseReturnLine);
      }

      const docNo = await this.numberSeries.next('PURCHASE_RETURN', fy, session);
      const [created] = await this.model.create(
        [
          {
            docNo,
            docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
            supplierId: new Types.ObjectId(String(inward.supplierId)),
            purchaseId: new Types.ObjectId(String(inward.purchaseId)),
            inwardId: new Types.ObjectId(String(inward._id)),
            locationId: new Types.ObjectId(locationId),
            reason: dto.reason,
            remarks: dto.remarks,
            lines,
            totalAmount: roundMoney(lines.reduce((s, l) => s + l.amount, 0)),
            status: 'DRAFT',
            createdBy: actorId,
            updatedBy: actorId,
          },
        ],
        { session },
      );
      if (dto.confirm) await this.confirmInSession(created, actorId, fy, session);
      return created;
    });
  }

  async confirm(id: string, actorId: string): Promise<PurchaseReturnDocument> {
    const fy = await this.purchasesService.currentFy();
    await this.numberSeries.ensureSeries('DEBIT_NOTE', fy, 'DN');
    return this.transactionService.run(async (session) => {
      const ret = await this.model.findById(id).session(session);
      if (!ret) throw new ProblemException('NOT_FOUND', 404, 'Purchase return not found.');
      await this.confirmInSession(ret, actorId, fy, session);
      return ret;
    });
  }

  /** DRAFT: plain cancel. CONFIRMED: reverses the PURCHASE_RETURN ledger rows (stock comes back) - STK-03. */
  async cancel(id: string, reason: string, actorId: string): Promise<PurchaseReturnDocument> {
    return this.transactionService.run(async (session) => {
      const ret = await this.model.findById(id).session(session);
      if (!ret) throw new ProblemException('NOT_FOUND', 404, 'Purchase return not found.');
      if (ret.status === 'CANCELLED') {
        throw new InvalidStateTransitionException('Purchase return is already cancelled.');
      }
      if (ret.status === 'CONFIRMED') {
        await this.stockService.reverseDocument(
          'PURCHASE_RETURN',
          String(ret._id),
          reason,
          session,
          actorId,
        );
        for (const line of ret.lines) {
          await this.inwardsService.bumpReturned(
            String(ret.inwardId),
            String(line.inwardLineId),
            -line.qty,
            session,
          );
        }
      }
      ret.status = 'CANCELLED';
      ret.cancelReason = reason;
      ret.cancelledBy = actorId as any;
      ret.cancelledAt = new Date();
      ret.updatedBy = actorId as any;
      ret.version += 1;
      await ret.save({ session });
      return ret;
    });
  }

  private async confirmInSession(
    ret: PurchaseReturnDocument,
    actorId: string,
    fy: string,
    session: ClientSession,
  ): Promise<void> {
    if (ret.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(`Purchase return is already ${ret.status}.`);
    }
    const inward = await this.inwardModel.findById(ret.inwardId).session(session).lean();
    if (!inward || inward.status !== 'CONFIRMED') {
      throw new InvalidStateTransitionException(
        'The inward this return refers to is no longer confirmed.',
      );
    }
    const virtualSupplier = await this.locationModel
      .findOne({ code: 'VIRT-SUPPLIER' })
      .session(session)
      .lean();
    if (!virtualSupplier) {
      throw new ProblemException('VALIDATION_FAILED', 500, 'VIRT-SUPPLIER location is not seeded.');
    }

    for (const line of ret.lines) {
      // Re-validate against the latest state: another return may have been confirmed, or the
      // lot partly issued, since this draft was saved.
      const inwardLine = inward.lines.find((l) => String(l._id) === String(line.inwardLineId));
      if (!inwardLine) {
        throw new ProblemException('VALIDATION_FAILED', 422, 'Inward line no longer exists.');
      }
      const lot = await this.lotModel.findById(line.lotId).session(session).lean();
      assertReturnable({
        label: `Lot ${lot?.lotNo ?? line.lotId}`,
        received: inwardLine.qtyBase,
        alreadyReturned: inwardLine.qtyReturnedBase ?? 0,
        onHand: await this.onHand(String(line.lotId), String(ret.locationId), session),
        requested: line.qty,
        lotId: String(line.lotId),
        locationId: String(ret.locationId),
      });

      await this.stockService.post(
        [
          {
            type: 'PURCHASE_RETURN',
            stockItemId: String(line.stockItemId),
            lotId: String(line.lotId),
            fromLocationId: String(ret.locationId),
            toLocationId: String(virtualSupplier._id),
            qty: line.qty,
            doc: { type: 'PURCHASE_RETURN', id: String(ret._id), lineId: String(line._id) },
            businessDate: ret.docDate,
            reason: ret.reason,
          },
        ],
        session,
        actorId,
      );
      await this.inwardsService.bumpReturned(
        String(ret.inwardId),
        String(line.inwardLineId),
        line.qty,
        session,
      );
      // Keep the in-memory copy current for the next line on the same inward line (not
      // possible today - duplicates are rejected - but cheap insurance).
      inwardLine.qtyReturnedBase = (inwardLine.qtyReturnedBase ?? 0) + line.qty;
    }

    // Debit note number allocated last so a rollback returns it to the pool (tech.md §4.4).
    ret.debitNoteNo = await this.numberSeries.next('DEBIT_NOTE', fy, session);
    ret.status = 'CONFIRMED';
    ret.confirmedBy = actorId as any;
    ret.confirmedAt = new Date();
    ret.updatedBy = actorId as any;
    ret.version += 1;
    await ret.save({ session });
  }

  private async onHand(lotId: string, locationId: string, session?: ClientSession) {
    const bal = await this.balanceModel
      .findOne({ lotId: new Types.ObjectId(lotId), locationId: new Types.ObjectId(locationId) })
      .session(session ?? null)
      .lean();
    return roundQty(bal?.qty ?? 0);
  }

  private async assertPhysicalLocation(locationId: string, session: ClientSession) {
    const loc = await this.locationModel.findById(locationId).session(session).lean();
    if (!loc) throw new ProblemException('NOT_FOUND', 404, 'Stock location not found.');
    if (loc.kind.startsWith('VIRTUAL')) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        'Goods can only be returned from a physical location.',
        { locationId: 'virtual location' },
      );
    }
  }
}
