import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Purchase, PurchaseDocument, PurchaseLine } from './schemas/purchase.schema';
import { Inward, InwardDocument } from './schemas/inward.schema';
import { Material, MaterialDocument } from '../master/schemas/material.schema';
import { Supplier, SupplierDocument } from '../master/schemas/supplier.schema';
import { UomsService } from '../master/uoms.service';
import { MaterialsService } from '../master/materials.service';
import { NumberSeriesService } from '../common/services/number-series.service';
import { CompanySettingsService } from '../master/company-settings.service';
import { apportionOtherCharges } from './apportionment.util';
import { roundMoney, roundQty, roundUnitCost, toDecimal } from '../common/utils/decimal';
import {
  ConflictVersionException,
  DuplicateNumberException,
  InvalidStateTransitionException,
  ProblemException,
} from '../common/errors/problem.exception';
import { CreatePurchaseDto, PurchaseLineInputDto, UpdatePurchaseDto } from './dto/purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(
    @InjectModel(Purchase.name) private readonly model: Model<PurchaseDocument>,
    @InjectModel(Inward.name) private readonly inwardModel: Model<InwardDocument>,
    @InjectModel(Material.name) private readonly materialModel: Model<MaterialDocument>,
    @InjectModel(Supplier.name) private readonly supplierModel: Model<SupplierDocument>,
    private readonly uomsService: UomsService,
    private readonly materialsService: MaterialsService,
    private readonly numberSeries: NumberSeriesService,
    private readonly companySettings: CompanySettingsService,
  ) {}

  list(filter: Record<string, unknown> = {}) {
    const castFilter = { ...filter };
    if (typeof castFilter.supplierId === 'string') {
      castFilter.supplierId = new Types.ObjectId(castFilter.supplierId);
    }
    return this.model.find(castFilter).sort({ createdAt: -1 }).lean();
  }

  async findById(id: string) {
    const doc = await this.model.findById(id).lean();
    if (!doc) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    return doc;
  }

  /** INW-05: confirmed/partially-received purchases still awaiting some material. */
  async pendingInward() {
    const purchases = await this.model
      .find({ status: { $in: ['CONFIRMED', 'PARTIALLY_RECEIVED'] } })
      .sort({ createdAt: -1 })
      .lean();
    return purchases.filter((p) => p.lines.some((l) => l.qtyReceivedBase < l.qtyBase - 0.0005));
  }

  async create(dto: CreatePurchaseDto, actorId: string): Promise<PurchaseDocument> {
    await this.assertSupplier(dto.supplierId);
    const lines = await this.buildLines(dto.lines, actorId);
    const fy = await this.currentFy();
    await this.numberSeries.ensureSeries('PURCHASE', fy, 'PUR');
    const docNo = await this.numberSeries.next('PURCHASE', fy);

    try {
      const [created] = await this.model.create([
        {
          docNo,
          docDate: dto.docDate ? new Date(dto.docDate) : new Date(),
          supplierId: new Types.ObjectId(dto.supplierId),
          supplierInvoiceNo: dto.supplierInvoiceNo?.trim() || undefined,
          expectedDeliveryDate: dto.expectedDeliveryDate
            ? new Date(dto.expectedDeliveryDate)
            : undefined,
          lines,
          otherCharges: roundMoney(dto.otherCharges ?? 0),
          notes: dto.notes,
          status: 'DRAFT',
          createdBy: actorId,
          updatedBy: actorId,
        },
      ]);
      return created;
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new DuplicateNumberException(
          `Supplier invoice ${dto.supplierInvoiceNo} was already entered for this supplier.`,
        );
      }
      throw err;
    }
  }

  /**
   * DRAFT: everything is editable. Confirmed or later: locked apart from notes (BR-11 /
   * PUR-06) - anything else must be cancelled and re-entered.
   */
  async update(
    id: string,
    dto: UpdatePurchaseDto,
    actorId: string,
    expectedVersion?: number,
  ): Promise<PurchaseDocument> {
    const purchase = await this.model.findById(id);
    if (!purchase) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    if (expectedVersion !== undefined && purchase.version !== expectedVersion) {
      throw new ConflictVersionException();
    }
    if (purchase.status !== 'DRAFT') {
      const locked = [
        'supplierId',
        'supplierInvoiceNo',
        'expectedDeliveryDate',
        'otherCharges',
        'lines',
      ] as const;
      const lockedFields = locked.filter((k) => dto[k] !== undefined);
      if (lockedFields.length) {
        throw new InvalidStateTransitionException(
          `A ${purchase.status} purchase is locked: only notes and attachments can change. Cancel and re-enter instead.`,
          { lockedFields },
        );
      }
    }

    if (dto.supplierId !== undefined) {
      await this.assertSupplier(dto.supplierId);
      purchase.supplierId = new Types.ObjectId(dto.supplierId);
    }
    if (dto.lines) purchase.lines = (await this.buildLines(dto.lines, actorId)) as any;
    if (dto.supplierInvoiceNo !== undefined)
      purchase.supplierInvoiceNo = dto.supplierInvoiceNo.trim() || undefined;
    if (dto.expectedDeliveryDate !== undefined)
      purchase.expectedDeliveryDate = new Date(dto.expectedDeliveryDate);
    if (dto.otherCharges !== undefined) purchase.otherCharges = roundMoney(dto.otherCharges);
    if (dto.notes !== undefined) purchase.notes = dto.notes;
    purchase.updatedBy = actorId as any;
    purchase.version += 1;

    try {
      await purchase.save();
      return purchase;
    } catch (err: any) {
      if (err?.code === 11000) {
        throw new DuplicateNumberException(
          `Supplier invoice ${dto.supplierInvoiceNo} was already entered for this supplier.`,
        );
      }
      throw err;
    }
  }

  /** PUR-05: confirming creates an expected receipt only - no stock effect (BR-01). */
  async confirm(id: string, actorId: string): Promise<PurchaseDocument> {
    const purchase = await this.model.findById(id);
    if (!purchase) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    if (purchase.status !== 'DRAFT') {
      throw new InvalidStateTransitionException(`Purchase is already ${purchase.status}.`);
    }
    this.applyLandedCosts(purchase);
    purchase.status = 'CONFIRMED';
    purchase.confirmedBy = actorId as any;
    purchase.confirmedAt = new Date();
    purchase.updatedBy = actorId as any;
    purchase.version += 1;
    await purchase.save();
    return purchase;
  }

  /** PUR-04: apportion other charges by value and set each line's landed cost per base unit. */
  applyLandedCosts(purchase: { lines: PurchaseLine[]; otherCharges: number }): void {
    const amounts = purchase.lines.map((l) => l.amount);
    const shares = apportionOtherCharges(amounts, purchase.otherCharges);
    purchase.lines.forEach((line, i) => {
      line.otherChargesShare = shares[i];
      line.landedUnitCost = roundUnitCost(
        toDecimal(line.amount).plus(shares[i]).dividedBy(line.qtyBase),
      );
    });
  }

  /** PUR-06: confirmed purchases are locked; cancel is blocked while any inward exists. */
  async cancel(id: string, reason: string, actorId: string): Promise<PurchaseDocument> {
    const purchase = await this.model.findById(id);
    if (!purchase) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    if (purchase.status === 'CANCELLED') {
      throw new InvalidStateTransitionException('Purchase is already cancelled.');
    }

    const anyInward = await this.inwardModel.exists({
      purchaseId: purchase._id,
      status: { $ne: 'CANCELLED' },
    });
    if (anyInward) {
      throw new InvalidStateTransitionException(
        'Cannot cancel: at least one inward exists against this purchase. Cancel the inward(s) first.',
        { purchaseId: id },
      );
    }

    purchase.status = 'CANCELLED';
    purchase.cancelReason = reason;
    purchase.cancelledBy = actorId as any;
    purchase.cancelledAt = new Date();
    purchase.updatedBy = actorId as any;
    purchase.version += 1;
    await purchase.save();
    return purchase;
  }

  /** BR-11: notes/attachments stay editable even on a confirmed purchase. */
  async addAttachment(id: string, url: string, actorId: string): Promise<PurchaseDocument> {
    const purchase = await this.model.findByIdAndUpdate(
      id,
      { $push: { attachmentUrls: url }, $set: { updatedBy: actorId }, $inc: { version: 1 } },
      { new: true },
    );
    if (!purchase) throw new ProblemException('NOT_FOUND', 404, 'Purchase not found.');
    return purchase;
  }

  /** Called by InwardsService after a confirmed inward, to keep the pending-inward view accurate. */
  async bumpReceived(
    purchaseId: string,
    purchaseLineId: string,
    qtyBase: number,
    session: ClientSession,
  ): Promise<void> {
    await this.model.updateOne(
      { _id: new Types.ObjectId(purchaseId), 'lines._id': new Types.ObjectId(purchaseLineId) },
      { $inc: { 'lines.$.qtyReceivedBase': qtyBase } },
      { session },
    );
    const purchase = await this.model.findById(purchaseId).session(session).lean();
    if (!purchase) return;
    const fullyReceived = purchase.lines.every((l) => l.qtyReceivedBase >= l.qtyBase - 0.0005);
    const anyReceived = purchase.lines.some((l) => l.qtyReceivedBase > 0.0005);
    // After an inward cancellation drives every line back to 0 this must revert to CONFIRMED,
    // not keep a stale RECEIVED.
    const nextStatus = fullyReceived
      ? 'RECEIVED'
      : anyReceived
        ? 'PARTIALLY_RECEIVED'
        : 'CONFIRMED';
    if (nextStatus !== purchase.status) {
      await this.model.updateOne(
        { _id: new Types.ObjectId(purchaseId) },
        { $set: { status: nextStatus } },
        { session },
      );
    }
  }

  async currentFy(): Promise<string> {
    const settings = await this.companySettings.get();
    return settings?.currentFinancialYear ?? new Date().getFullYear().toString();
  }

  async assertSupplier(supplierId: string, session?: ClientSession): Promise<void> {
    const supplier = await this.supplierModel
      .findById(supplierId)
      .session(session ?? null)
      .lean();
    if (!supplier) throw new ProblemException('NOT_FOUND', 404, 'Supplier not found.');
    if (supplier.isActive === false) {
      throw new ProblemException('VALIDATION_FAILED', 422, 'Supplier is inactive.', {
        supplierId: 'inactive',
      });
    }
  }

  /** PUR-03: amounts and base quantities are computed here, never trusted from the client. */
  async buildLines(
    inputs: PurchaseLineInputDto[],
    actorId?: string,
    session?: ClientSession,
  ): Promise<PurchaseLine[]> {
    const lines: PurchaseLine[] = [];
    for (const input of inputs) {
      const variant = await this.materialsService.resolveVariant(input, actorId, session);
      const material = await this.materialModel
        .findById(variant.materialId)
        .session(session ?? null)
        .lean();
      if (!material) {
        throw new ProblemException('NOT_FOUND', 404, `Material ${variant.materialId} not found.`);
      }
      const uomId = input.uomId ?? String(material.baseUomId);
      // Unit conversions (MST-04) are keyed by materialId, not materialVariantId.
      const qtyBase = await this.uomsService.toBaseQuantity(
        String(variant.materialId),
        uomId,
        input.qty,
      );
      lines.push({
        _id: new Types.ObjectId(),
        materialVariantId: new Types.ObjectId(String(variant._id)),
        uomId: new Types.ObjectId(uomId),
        qty: roundQty(input.qty),
        rate: input.rate,
        amount: roundMoney(toDecimal(input.qty).times(input.rate)),
        qtyBase,
        qtyReceivedBase: 0,
      } as unknown as PurchaseLine);
    }
    return lines;
  }
}
