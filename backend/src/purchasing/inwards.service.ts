import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Inward, InwardDocument, InwardLine } from './schemas/inward.schema';
import { Purchase, PurchaseDocument } from './schemas/purchase.schema';
import { PurchaseReturn, PurchaseReturnDocument } from './schemas/purchase-return.schema';
import { MaterialVariant, MaterialVariantDocument } from '../master/schemas/material.schema';
import { StockLocation, StockLocationDocument } from '../master/schemas/stock-location.schema';
import { StockLot, StockLotDocument } from '../inventory/schemas/stock-lot.schema';
import { PurchasesService } from './purchases.service';
import { StockService } from '../inventory/stock.service';
import { StockItemsService } from '../inventory/stock-items.service';
import { UomsService } from '../master/uoms.service';
import { LotNumbersService } from '../master/lot-numbers.service';
import { MaterialsService } from '../master/materials.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { TransactionService } from '../common/services/transaction.service';
import { roundMoney, roundQty } from '../common/utils/decimal';
import {
  InvalidStateTransitionException,
  OverReceiptToleranceExceededException,
  ProblemException,
} from '../common/errors/problem.exception';
import { CreateDirectInwardDto, CreateInwardDto } from './dto/inward.dto';

@Injectable()
export class InwardsService {
  constructor(
    @InjectModel(Inward.name) private readonly model: Model<InwardDocument>,
    @InjectModel(Purchase.name) private readonly purchaseModel: Model<PurchaseDocument>,
    @InjectModel(PurchaseReturn.name)
    private readonly returnModel: Model<PurchaseReturnDocument>,
    @InjectModel(MaterialVariant.name)
    private readonly variantModel: Model<MaterialVariantDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @InjectModel(StockLot.name) private readonly lotModel: Model<StockLotDocument>,
    private readonly purchasesService: PurchasesService,
    private readonly stockService: StockService,
    private readonly stockItemsService: StockItemsService,
    private readonly uomsService: UomsService,
    private readonly materialsService: MaterialsService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
    private readonly transactionService: TransactionService,
    private readonly lotNumbers: LotNumbersService,
  ) {}

  // Explicit casts: plain-string filtering of a non-_id ObjectId field is not reliably cast
  // by Mongoose in this environment.
  list(filter: Record<string, unknown> = {}) {
    const castFilter = { ...filter };
    for (const key of ['purchaseId', 'supplierId']) {
      if (typeof castFilter[key] === 'string') {
        castFilter[key] = new Types.ObjectId(castFilter[key] as string);
      }
    }
    return this.model.find(castFilter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Inward not found.');
    return doc;
  }

  /** INW-01/02: inward against a confirmed purchase. `dto.confirm` posts stock in the same transaction. */
  async create(dto: CreateInwardDto, actorId: string): Promise<InwardDocument> {
    const fy = await this.purchasesService.currentFy();
    await this.numberSeries.ensureSeries('INWARD', fy, 'INW');
    return this.transactionService.run(async (session) => {
      const inward = await this.createDraftInSession(dto, actorId, fy, session);
      if (dto.confirm) await this.confirmInSession(inward, actorId, session);
      return inward;
    });
  }

  /**
   * Goods received with no purchase raised first (DirectInwardForm). Rule 1 / INW-04 still
   * hold: a CONFIRMED purchase (isDirect) is raised behind the inward - same supplier, lines,
   * rates and landed-cost apportionment - and the inward against it is confirmed, all in one
   * transaction, so either everything (purchase, inward, lots, ledger) exists or nothing does.
   */
  async createDirect(dto: CreateDirectInwardDto, actorId: string): Promise<InwardDocument> {
    const fy = await this.purchasesService.currentFy();
    await this.numberSeries.ensureSeries('PURCHASE', fy, 'PUR');
    await this.numberSeries.ensureSeries('INWARD', fy, 'INW');
    const docDate = dto.docDate ? new Date(dto.docDate) : new Date();

    try {
      return await this.transactionService.run(async (session) => {
        await this.purchasesService.assertSupplier(dto.supplierId, session);
        const purchaseLines = await this.purchasesService.buildLines(
          dto.lines.map((l) => ({ ...l, rate: l.rate ?? 0 })),
          actorId,
          session,
        );
        const draft = {
          lines: purchaseLines,
          otherCharges: roundMoney(dto.otherCharges ?? 0),
        };
        this.purchasesService.applyLandedCosts(draft);

        const purchaseNo = await this.numberSeries.next('PURCHASE', fy, session);
        const [purchase] = await this.purchaseModel.create(
          [
            {
              docNo: purchaseNo,
              docDate,
              supplierId: new Types.ObjectId(dto.supplierId),
              supplierInvoiceNo: dto.supplierInvoiceNo?.trim() || undefined,
              lines: draft.lines,
              otherCharges: draft.otherCharges,
              notes: dto.remarks,
              isDirect: true,
              status: 'CONFIRMED',
              confirmedBy: actorId,
              confirmedAt: new Date(),
              createdBy: actorId,
              updatedBy: actorId,
            },
          ],
          { session },
        );

        const inward = await this.createDraftInSession(
          {
            purchaseId: String(purchase._id),
            locationId: dto.locationId,
            docDate: dto.docDate,
            supplierRef: dto.supplierInvoiceNo,
            challanNo: dto.challanNo,
            lotNo: dto.lotNo,
            remarks: dto.remarks,
            lines: purchase.lines.map((pl, i) => ({
              purchaseLineId: String(pl._id),
              qty: pl.qty,
              lotNo: dto.lines[i].lotNo,
              thans: dto.lines[i].thans,
            })),
          },
          actorId,
          fy,
          session,
          { isDirect: true },
        );
        await this.confirmInSession(inward, actorId, session);
        return inward;
      });
    } catch (err: any) {
      if (err?.code === 11000 && /supplierInvoiceNo/.test(String(err?.message))) {
        throw new ProblemException(
          'DUPLICATE_NUMBER',
          409,
          `Supplier invoice ${dto.supplierInvoiceNo} was already entered for this supplier.`,
        );
      }
      throw err;
    }
  }

  /** INW-03: confirming puts material into stock as new lots carrying the purchase line's landed cost (BR-01). */
  async confirm(id: string, actorId: string): Promise<InwardDocument> {
    return this.transactionService.run(async (session) => {
      const inward = await this.model.findById(id).session(session);
      if (!inward) throw new ProblemException('NOT_FOUND', 404, 'Inward not found.');
      await this.confirmInSession(inward, actorId, session);
      return inward;
    });
  }

  /** DRAFT: plain cancel, no stock effect. CONFIRMED: reverses the ledger and un-does the purchase line's received total. */
  async cancel(id: string, reason: string, actorId: string): Promise<InwardDocument> {
    return this.transactionService.run(async (session) => {
      const inward = await this.model.findById(id).session(session);
      if (!inward) throw new ProblemException('NOT_FOUND', 404, 'Inward not found.');
      if (inward.status === 'CANCELLED') {
        throw new InvalidStateTransitionException('Inward is already cancelled.');
      }

      const activeReturn = await this.returnModel
        .findOne({ inwardId: inward._id, status: { $ne: 'CANCELLED' } })
        .session(session)
        .lean();
      if (activeReturn) {
        throw new InvalidStateTransitionException(
          `Cannot cancel: purchase return ${activeReturn.docNo} exists against this inward. Cancel the return first.`,
          { purchaseReturnId: String(activeReturn._id) },
        );
      }

      if (inward.status === 'CONFIRMED') {
        await this.stockService.reverseDocument(
          'INWARD',
          String(inward._id),
          reason,
          session,
          actorId,
        );
        for (const line of inward.lines) {
          await this.purchasesService.bumpReceived(
            String(inward.purchaseId),
            String(line.purchaseLineId),
            -line.qtyBase,
            session,
          );
        }
      }

      inward.status = 'CANCELLED';
      inward.cancelReason = reason;
      inward.cancelledBy = actorId as any;
      inward.cancelledAt = new Date();
      inward.updatedBy = actorId as any;
      inward.version += 1;
      await inward.save({ session });
      return inward;
    });
  }

  private async resolveLocation(locationId: string | undefined, session: ClientSession) {
    const loc = locationId
      ? await this.locationModel.findById(locationId).session(session).lean()
      : await this.locationModel.findOne({ code: 'MAIN-WH' }).session(session).lean();
    if (!loc) throw new ProblemException('NOT_FOUND', 404, 'Stock location not found.');
    if (loc.kind.startsWith('VIRTUAL') || loc.kind === 'FACTORY_CUSTODY') {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Material can only be received into a warehouse or quarantine location, not ${loc.code}.`,
        { locationId: 'not a receiving location' },
      );
    }
    return loc;
  }

  private async createDraftInSession(
    dto: CreateInwardDto,
    actorId: string,
    fy: string,
    session: ClientSession,
    opts: { isDirect?: boolean } = {},
  ): Promise<InwardDocument> {
    const purchase = await this.purchaseModel.findById(dto.purchaseId).session(session).lean();
    if (!purchase) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(purchase.status)) {
      throw new InvalidStateTransitionException(
        `Cannot inward against a purchase in status ${purchase.status}. Confirm the purchase first.`,
      );
    }
    const location = await this.resolveLocation(dto.locationId, session);
    const settings = await this.companySettings.get();
    const tolerancePct = settings?.overReceiptTolerancePct ?? 0;

    const seen = new Set<string>();
    const lines: InwardLine[] = [];
    for (const lineInput of dto.lines) {
      if (seen.has(lineInput.purchaseLineId)) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          'The same purchase line appears twice in this inward.',
        );
      }
      seen.add(lineInput.purchaseLineId);
      const purchaseLine = purchase.lines.find((l) => String(l._id) === lineInput.purchaseLineId);
      if (!purchaseLine) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Purchase line ${lineInput.purchaseLineId} not found on this purchase.`,
        );
      }
      const orderedVariant = await this.variantModel
        .findById(purchaseLine.materialVariantId)
        .session(session)
        .lean();
      if (!orderedVariant) {
        throw new ProblemException('NOT_FOUND', 404, 'Material variant of the purchase line not found.');
      }

      // INW-02 colour: default to the ordered colour; allow recording a different shade of
      // the same material when that is what arrived.
      let receivedVariantId = String(orderedVariant._id);
      if (lineInput.materialVariantId || lineInput.colourId || lineInput.colourName?.trim()) {
        const received = await this.materialsService.resolveVariant(
          {
            materialVariantId: lineInput.materialVariantId,
            materialId: String(orderedVariant.materialId),
            colourId: lineInput.colourId,
            colourName: lineInput.colourName,
          },
          actorId,
          session,
        );
        if (String(received.materialId) !== String(orderedVariant.materialId)) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            'The received material must be the same material as ordered (only the colour may differ).',
            { materialVariantId: 'different material' },
          );
        }
        receivedVariantId = String(received._id);
      }

      if (lineInput.thans?.length) {
        const sum = lineInput.thans.reduce((a, t) => a + t, 0);
        if (Math.abs(sum - lineInput.qty) > 0.001) {
          throw new ProblemException(
            'VALIDATION_FAILED',
            422,
            `Quantity ${lineInput.qty} does not match the total of its thans (${roundQty(sum)}).`,
            { thans: 'sum must equal qty' },
          );
        }
      }

      const qtyBase = await this.uomsService.toBaseQuantity(
        String(orderedVariant.materialId),
        String(purchaseLine.uomId),
        lineInput.qty,
      );
      this.assertWithinTolerance(purchaseLine, qtyBase, tolerancePct);

      lines.push({
        purchaseLineId: new Types.ObjectId(String(purchaseLine._id)),
        materialVariantId: new Types.ObjectId(receivedVariantId),
        uomId: purchaseLine.uomId ? new Types.ObjectId(String(purchaseLine.uomId)) : undefined,
        qty: roundQty(lineInput.qty),
        qtyBase,
        rate: purchaseLine.rate,
        lotNo: lineInput.lotNo?.trim() || undefined,
        thans: lineInput.thans?.length ? lineInput.thans.map((t) => roundQty(t)) : undefined,
        qtyReturnedBase: 0,
      } as unknown as InwardLine);
    }

    const docNo = await this.numberSeries.next('INWARD', fy, session);
    const lotNo = await this.lotNumbers.use('SUPPLIER', String(purchase.supplierId), dto.lotNo, session);
    const [created] = await this.model.create(
      [
        {
          docNo,
          docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
          // Explicit casts: PurchasesService.cancel()'s inwardModel.exists({purchaseId}) check
          // depends on this field being a real ObjectId, not a string.
          purchaseId: new Types.ObjectId(dto.purchaseId),
          supplierId: new Types.ObjectId(String(purchase.supplierId)),
          locationId: new Types.ObjectId(String(location._id)),
          lines,
          supplierRef: dto.supplierRef?.trim() || undefined,
          challanNo: dto.challanNo?.trim() || undefined,
          lotNo,
          isDirect: opts.isDirect ?? false,
          remarks: dto.remarks,
          status: 'DRAFT',
          createdBy: actorId,
          updatedBy: actorId,
        },
      ],
      { session },
    );
    return created;
  }

  /** INW-01: over-receipt beyond the configurable tolerance is blocked. */
  private assertWithinTolerance(
    purchaseLine: { _id: any; qtyBase: number; qtyReceivedBase: number },
    qtyBase: number,
    tolerancePct: number,
  ) {
    const allowedMax = purchaseLine.qtyBase * (1 + tolerancePct / 100);
    const projected = purchaseLine.qtyReceivedBase + qtyBase;
    if (projected > allowedMax + 0.0005) {
      const pending = Math.max(0, roundQty(purchaseLine.qtyBase - purchaseLine.qtyReceivedBase));
      throw new OverReceiptToleranceExceededException(
        `Receiving ${qtyBase} would exceed the ordered quantity (${purchaseLine.qtyBase}, ${purchaseLine.qtyReceivedBase} already received, ${pending} pending) beyond the ${tolerancePct}% tolerance.`,
        {
          purchaseLineId: String(purchaseLine._id),
          ordered: purchaseLine.qtyBase,
          alreadyReceived: purchaseLine.qtyReceivedBase,
          pending,
          requested: qtyBase,
          tolerancePct,
        },
      );
    }
  }

  private async confirmInSession(
    inward: InwardDocument,
    actorId: string,
    session: ClientSession,
  ): Promise<void> {
    if (inward.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(`Inward is already ${inward.status}.`);
    }
    const purchase = await this.purchaseModel.findById(inward.purchaseId).session(session);
    if (!purchase) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    if (!['CONFIRMED', 'PARTIALLY_RECEIVED'].includes(purchase.status)) {
      throw new InvalidStateTransitionException(
        `Cannot confirm an inward against a purchase in status ${purchase.status}.`,
      );
    }

    const settings = await this.companySettings.get();
    const tolerancePct = settings?.overReceiptTolerancePct ?? 0;

    const virtualSupplierLoc = await this.locationModel
      .findOne({ code: 'VIRT-SUPPLIER' })
      .session(session)
      .lean();
    if (!virtualSupplierLoc) {
      throw new ProblemException('VALIDATION_FAILED', 500, 'VIRT-SUPPLIER location is not seeded.');
    }

    for (const line of inward.lines) {
      // Re-read every iteration: bumpReceived below updates the purchase in this session.
      const fresh = await this.purchaseModel.findById(inward.purchaseId).session(session).lean();
      const purchaseLine = fresh?.lines.find((l) => String(l._id) === String(line.purchaseLineId));
      if (!purchaseLine) {
        throw new ProblemException(
          'VALIDATION_FAILED',
          422,
          `Purchase line ${line.purchaseLineId} no longer exists.`,
        );
      }
      this.assertWithinTolerance(purchaseLine, line.qtyBase, tolerancePct);

      const stockItem = await this.stockItemsService.getOrCreateForMaterialVariant(
        String(line.materialVariantId),
        session,
      );

      // Lot numbers are unique per stock item: a supplier batch number seen before for this
      // item (e.g. a repeat delivery quoting the same batch) is suffixed with this inward's number.
      let lotNo = line.lotNo || inward.lotNo || `${inward.docNo}-${inward.lines.indexOf(line) + 1}`;
      const clash = await this.lotModel
        .exists({ stockItemId: stockItem._id, lotNo })
        .session(session);
      if (clash) lotNo = `${lotNo} / ${inward.docNo}-${inward.lines.indexOf(line) + 1}`;

      const posted = await this.stockService.post(
        [
          {
            type: 'INWARD',
            stockItemId: String(stockItem._id),
            fromLocationId: String(virtualSupplierLoc._id),
            toLocationId: String(inward.locationId),
            qty: line.qtyBase,
            unitCost: purchaseLine.landedUnitCost ?? 0,
            lotOrigin: {
              lotNo,
              receivedOn: inward.docDate,
              originDocType: 'INWARD',
              originDocId: String(inward._id),
              supplierId: String(inward.supplierId),
            },
            doc: { type: 'INWARD', id: String(inward._id), lineId: String(line._id) },
            businessDate: inward.docDate,
          },
        ],
        session,
        actorId,
      );

      line.createdLotId = new Types.ObjectId(posted[0].lotId);
      if (line.thans?.length) {
        await this.lotModel.updateOne({ _id: line.createdLotId }, { $set: { thans: line.thans } }, { session });
      }
      line.unitCost = purchaseLine.landedUnitCost ?? 0;

      await this.purchasesService.bumpReceived(
        String(inward.purchaseId),
        String(purchaseLine._id),
        line.qtyBase,
        session,
      );
    }

    inward.status = 'CONFIRMED';
    inward.confirmedBy = actorId as any;
    inward.confirmedAt = new Date();
    inward.updatedBy = actorId as any;
    inward.version += 1;
    await inward.save({ session });
  }

  /** PUR-08: called by PurchaseReturnsService when a return is confirmed (+) or cancelled (-). */
  async bumpReturned(
    inwardId: string,
    inwardLineId: string,
    qtyBase: number,
    session: ClientSession,
  ): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(inwardId), 'lines._id': new Types.ObjectId(inwardLineId) },
      { $inc: { 'lines.$.qtyReturnedBase': qtyBase } },
      { session },
    );
  }
}
