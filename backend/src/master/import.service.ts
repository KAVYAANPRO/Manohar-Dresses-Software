import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { parse } from 'csv-parse/sync';
import { ImportBatch, ImportBatchDocument } from './schemas/import-batch.schema';
import { StockLocation, StockLocationDocument } from './schemas/stock-location.schema';
import { SuppliersService } from './suppliers.service';
import { CustomersService } from './customers.service';
import { MaterialsService } from './materials.service';
import { JobWorkersService } from './job-workers.service';
import { StockItemsService } from '../inventory/stock-items.service';
import { StockService } from '../inventory/stock.service';
import { TransactionService } from '../common/services/transaction.service';
import { CreateSupplierDto } from './dto/supplier.dto';
import { CreateCustomerDto } from './dto/customer.dto';
import { CreateMaterialDto } from './dto/material.dto';
import { CreateJobWorkerDto } from './dto/job-worker.dto';
import { ImportableEntity, OpeningStockRowDto } from './dto/import.dto';
import { validateDto } from '../common/utils/validate-dto';
import { ProblemException, ValidationFailedException } from '../common/errors/problem.exception';
import { roundUnitCost } from '../common/utils/decimal';

interface RowResult {
  row: number;
  ok: boolean;
  data?: Record<string, unknown>;
  reasons?: Record<string, string>;
}

export interface ImportReport {
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  rejections: Array<{ row: number; reasons: Record<string, string> }>;
}

/**
 * MST-11 (go-live prerequisite, prd.md A-14). Dry run reports every rejected row with a
 * reason and changes nothing; commit is all-or-nothing for the four master entities
 * (suppliers, customers, materials, job workers) - a partially-bad file can never leave the
 * database in a half-imported state. Opening stock is different: each row is its own stock
 * movement (StockService.post(), one transaction per row), so a row-level failure there
 * cannot roll back rows already posted - the dry run is what actually prevents a bad load,
 * since a clean dry run means every row will individually succeed at commit time.
 */
@Injectable()
export class ImportService {
  constructor(
    private readonly suppliers: SuppliersService,
    private readonly customers: CustomersService,
    private readonly materials: MaterialsService,
    private readonly jobWorkers: JobWorkersService,
    @InjectModel(ImportBatch.name) private readonly batchModel: Model<ImportBatchDocument>,
    @InjectModel(StockLocation.name) private readonly locationModel: Model<StockLocationDocument>,
    @Inject(forwardRef(() => StockItemsService)) private readonly stockItemsService: StockItemsService,
    @Inject(forwardRef(() => StockService)) private readonly stockService: StockService,
    private readonly transactionService: TransactionService,
  ) {}

  async dryRun(entity: ImportableEntity, csv: string, actorId?: string): Promise<ImportReport> {
    const { results } = await this.validateRows(entity, csv);
    const report = this.toReport(results);
    await this.batchModel.create({
      entity,
      dryRun: true,
      committed: false,
      totalRows: report.totalRows,
      validRows: report.validRows,
      rejectedRows: report.rejectedRows,
      rejections: report.rejections,
      createdBy: actorId,
    });
    return report;
  }

  async commit(
    entity: ImportableEntity,
    csv: string,
    actorId?: string,
  ): Promise<{ imported: number }> {
    const { results } = await this.validateRows(entity, csv);
    const report = this.toReport(results);

    if (report.rejectedRows > 0) {
      await this.batchModel.create({
        entity,
        dryRun: false,
        committed: false,
        ...report,
        createdBy: actorId,
      });
      throw new ValidationFailedException(
        Object.fromEntries(
          report.rejections.map((r) => [`row_${r.row}`, JSON.stringify(r.reasons)]),
        ),
        `Import rejected: ${report.rejectedRows} of ${report.totalRows} row(s) failed validation. Nothing was imported - fix and retry.`,
      );
    }

    for (const r of results) {
      await this.createOne(entity, r.data!, actorId);
    }

    await this.batchModel.create({
      entity,
      dryRun: false,
      committed: true,
      totalRows: report.totalRows,
      validRows: report.validRows,
      rejectedRows: 0,
      createdBy: actorId,
    });

    return { imported: results.length };
  }

  private async validateRows(
    entity: ImportableEntity,
    csv: string,
  ): Promise<{ results: RowResult[] }> {
    let records: Record<string, unknown>[];
    try {
      records = parse(csv, { columns: true, skip_empty_lines: true, trim: true });
    } catch (err) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Could not parse CSV: ${(err as Error).message}`,
      );
    }

    const dtoClass = this.dtoFor(entity);
    const results: RowResult[] = [];
    for (let i = 0; i < records.length; i++) {
      try {
        const dto = await validateDto(dtoClass, records[i]);
        if (entity === 'opening-stock') {
          await this.checkOpeningStockRow(dto as unknown as OpeningStockRowDto);
        }
        results.push({ row: i + 1, ok: true, data: dto as Record<string, unknown> });
      } catch (err) {
        if (err instanceof ValidationFailedException) {
          results.push({ row: i + 1, ok: false, reasons: err.fieldErrors });
        } else if (err instanceof ProblemException) {
          results.push({ row: i + 1, ok: false, reasons: { row: err.message } });
        } else {
          throw err;
        }
      }
    }
    return { results };
  }

  /**
   * DTO-level validation only checks shape (a well-formed ObjectId, a positive number); it
   * cannot catch "this material variant does not exist" or "this location code is wrong".
   * Opening stock has no second chance to roll back a partially-posted batch (each row is
   * its own stock movement, not one all-or-nothing transaction), so the dry run resolves
   * every reference up front - a clean dry run is the actual guarantee that commit succeeds.
   */
  private async checkOpeningStockRow(row: OpeningStockRowDto): Promise<void> {
    await this.stockItemsService.getOrCreateForMaterialVariant(row.materialVariantId);
    const location = await this.locationModel.findOne({ code: row.locationCode ?? 'MAIN-WH' }).lean();
    if (!location) {
      throw new ProblemException(
        'VALIDATION_FAILED',
        422,
        `Unknown location code "${row.locationCode ?? 'MAIN-WH'}".`,
      );
    }
  }

  private toReport(results: RowResult[]): ImportReport {
    const rejections = results
      .filter((r) => !r.ok)
      .map((r) => ({ row: r.row, reasons: r.reasons! }));
    return {
      totalRows: results.length,
      validRows: results.length - rejections.length,
      rejectedRows: rejections.length,
      rejections,
    };
  }

  private dtoFor(entity: ImportableEntity): new () => object {
    switch (entity) {
      case 'suppliers':
        return CreateSupplierDto;
      case 'customers':
        return CreateCustomerDto;
      case 'materials':
        return CreateMaterialDto;
      case 'job-workers':
        return CreateJobWorkerDto;
      case 'opening-stock':
        return OpeningStockRowDto;
      default:
        throw new ProblemException('VALIDATION_FAILED', 422, `Unknown import entity: ${entity}`);
    }
  }

  private async createOne(
    entity: ImportableEntity,
    data: Record<string, unknown>,
    actorId?: string,
  ) {
    switch (entity) {
      case 'suppliers':
        return this.suppliers.create(data, actorId);
      case 'customers':
        return this.customers.create(data, actorId);
      case 'materials':
        return this.materials.create(data, actorId);
      case 'job-workers':
        return this.jobWorkers.create(data as unknown as CreateJobWorkerDto, actorId);
      case 'opening-stock':
        return this.createOpeningStockLot(data as unknown as OpeningStockRowDto, actorId);
      default:
        throw new ProblemException('VALIDATION_FAILED', 422, `Unknown import entity: ${entity}`);
    }
  }

  /** MST-11/A-14: one lot per row, posted OPENING (Warehouse), from VIRT-ADJUSTMENT like a stock-adjustment IN (tech.md §4.3's lot origins). */
  private async createOpeningStockLot(row: OpeningStockRowDto, actorId?: string) {
    return this.transactionService.run(async (session) => {
      const stockItem = await this.stockItemsService.getOrCreateForMaterialVariant(
        row.materialVariantId,
        session,
      );
      const location = await this.locationModel
        .findOne({ code: row.locationCode ?? 'MAIN-WH' })
        .session(session)
        .lean();
      const virtAdjustment = await this.locationModel
        .findOne({ code: 'VIRT-ADJUSTMENT' })
        .session(session)
        .lean();
      if (!location || !virtAdjustment) {
        throw new ProblemException('VALIDATION_FAILED', 500, 'Required stock locations are not seeded.');
      }

      const [posted] = await this.stockService.post(
        [
          {
            type: 'OPENING',
            stockItemId: String(stockItem._id),
            fromLocationId: String(virtAdjustment._id),
            toLocationId: String(location._id),
            qty: row.qty,
            unitCost: roundUnitCost(row.unitCost),
            lotOrigin: { originDocType: 'OPENING', lotNo: row.lotNo },
            doc: { type: 'OPENING_STOCK_IMPORT', id: String(stockItem._id) },
          },
        ],
        session,
        actorId ?? 'system',
      );
      return { stockItemId: String(stockItem._id), lotId: posted.lotId, qty: posted.qty };
    });
  }
}
