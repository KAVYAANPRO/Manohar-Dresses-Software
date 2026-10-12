import { Body, Controller, ForbiddenException, Get, Param, Post } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JobSlipsService } from './job-slips.service';
import { MaterialIssuesService } from './material-issues.service';
import { JobMaterialLine, JobMaterialLineDocument } from './schemas/job-material-line.schema';
import { JobSlip, JobSlipDocument } from './schemas/job-slip.schema';
import { MaterialIssue, MaterialIssueDocument } from './schemas/material-issue.schema';
import { MaterialReturn, MaterialReturnDocument } from './schemas/material-return.schema';
import { JobReceipt, JobReceiptDocument } from './schemas/job-receipt.schema';
import { JobworkLookupService } from './jobwork-lookup.service';
import { PartyScopeService } from '../common/services/party-scope.service';
import { RequestContextStore } from '../common/context/request-context';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { Idempotent } from '../common/decorators/idempotent.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { PERMISSIONS } from '../identity/permissions.catalogue';
import { validateDto } from '../common/utils/validate-dto';
import { roundQty } from '../common/utils/decimal';
import { AcknowledgeMaterialIssueDto } from './dto/material-issue.dto';
import { SetJobSlipStatusDto, DispatchDeclarationDto } from './dto/job-slip.dto';
import { NotFoundProblemException } from '../common/errors/problem.exception';

/**
 * JOB-14: the factory/artisan-facing surface for job work. Party isolation (BR-08): every
 * route checks the caller is a party principal and that the job belongs to THEIR job worker
 * (another party's job is a 404, never a 403, so ids cannot be probed). AUTH-07 / tech.md
 * §7.6: responses are built by explicit mappers below - no rate, cost, or charge ever leaves
 * this controller.
 */
@Controller('portal/v1/jobs')
export class PortalJobsController {
  constructor(
    private readonly jobSlipsService: JobSlipsService,
    private readonly materialIssuesService: MaterialIssuesService,
    private readonly partyScope: PartyScopeService,
    private readonly lookup: JobworkLookupService,
    @InjectModel(JobSlip.name) private readonly slipModel: Model<JobSlipDocument>,
    @InjectModel(JobMaterialLine.name)
    private readonly materialLineModel: Model<JobMaterialLineDocument>,
    @InjectModel(MaterialIssue.name) private readonly issueModel: Model<MaterialIssueDocument>,
    @InjectModel(MaterialReturn.name) private readonly returnModel: Model<MaterialReturnDocument>,
    @InjectModel(JobReceipt.name) private readonly receiptModel: Model<JobReceiptDocument>,
  ) {}

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_VIEW)
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    this.assertParty(user);
    const slips = await this.slipModel
      .find({
        jobWorkerId: new Types.ObjectId(user.jobWorkerId!),
        status: { $ne: 'CANCELLED' },
      })
      .sort({ createdAt: -1 })
      .lean();
    const ids = slips.map((s) => s._id);
    const [designs, issues, receipts] = await Promise.all([
      this.lookup.designs(slips.map((s) => s.designId)),
      this.issueModel.find({ jobSlipId: { $in: ids }, status: 'CONFIRMED' }).lean(),
      this.receiptModel.find({ jobSlipId: { $in: ids }, status: 'CONFIRMED' }).lean(),
    ]);
    return slips.map((s) => {
      const myIssues = issues.filter((i) => String(i.jobSlipId) === String(s._id));
      const received = roundQty(
        receipts
          .filter((r) => String(r.jobSlipId) === String(s._id))
          .reduce((a, r) => a + r.lines.reduce((b, l) => b + l.receivedQty, 0), 0),
      );
      return {
        ...this.mapSlip(s, designs.get(String(s.designId))),
        receivedByCompany: received,
        pendingAcknowledgement: myIssues.some((i) => !i.acknowledgedAt),
      };
    });
  }

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_VIEW)
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertParty(user);
    const slip = await this.ownSlip(id);
    const [designs, issues, returns, receipts, matLines] = await Promise.all([
      this.lookup.designs([slip.designId]),
      this.issueModel.find({ jobSlipId: slip._id, status: 'CONFIRMED' }).sort({ createdAt: 1 }).lean(),
      this.returnModel.find({ jobSlipId: slip._id, status: 'CONFIRMED' }).sort({ createdAt: 1 }).lean(),
      this.receiptModel.find({ jobSlipId: slip._id, status: 'CONFIRMED' }).sort({ createdAt: 1 }).lean(),
      this.materialLineModel.find({ jobSlipId: slip._id }).lean(),
    ]);
    const design = designs.get(String(slip.designId));
    const [colours, sizes, outVariants, variants, items] = await Promise.all([
      this.lookup.colours(slip.expectedOutputLines.map((l) => l.colourId)),
      this.lookup.sizes(slip.expectedOutputLines.map((l) => l.sizeId)),
      this.lookup.materialVariants(slip.expectedOutputLines.map((l) => l.materialVariantId)),
      this.lookup.materialVariants([
        ...issues.flatMap((i) => i.lines.map((l) => l.materialVariantId)),
        ...returns.flatMap((r) => r.lines.map((l) => l.materialVariantId)),
      ]),
      this.lookup.stockItemMaterials(matLines.map((l) => l.stockItemId)),
    ]);

    // material still with me, summed per material (no lot cost)
    const withMe = new Map<string, { name: string; uom: string; issued: number; returned: number; used: number; remaining: number }>();
    for (const l of matLines) {
      const mv = items.get(String(l.stockItemId));
      const k = mv?.materialVariantId ?? String(l.stockItemId);
      const row = withMe.get(k) ?? { name: mv?.name ?? '', uom: mv?.uom ?? '', issued: 0, returned: 0, used: 0, remaining: 0 };
      row.issued = roundQty(row.issued + l.qtyIssued);
      row.returned = roundQty(row.returned + l.qtyReturned);
      row.used = roundQty(row.used + l.qtyConsumed + l.qtyWrittenOff);
      row.remaining = roundQty(row.remaining + l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff);
      withMe.set(k, row);
    }

    return {
      ...this.mapSlip(slip, design),
      instructions: [slip.instructions, design?.manufacturingInstructions].filter(Boolean).join('\n\n'),
      expectedOutput: slip.expectedOutputLines.map((l) => ({
        colour: l.colourId ? colours.get(String(l.colourId)) : undefined,
        size: l.sizeId ? sizes.get(String(l.sizeId)) : undefined,
        material: l.materialVariantId ? outVariants.get(String(l.materialVariantId))?.name : undefined,
        uom: l.materialVariantId ? outVariants.get(String(l.materialVariantId))?.uom : 'pcs',
        qty: l.expectedQty,
      })),
      materialIssues: issues.map((i) => ({
        id: String(i._id),
        docNo: i.docNo,
        date: i.docDate,
        acknowledgedAt: i.acknowledgedAt ?? null,
        discrepancyNote: i.discrepancyNote,
        lines: i.lines.map((l) => ({
          material: variants.get(String(l.materialVariantId))?.name ?? '',
          uom: variants.get(String(l.materialVariantId))?.uom ?? '',
          qty: l.qtyBase,
        })),
      })),
      materialReturns: returns.map((r) => ({
        docNo: r.docNo,
        date: r.docDate,
        lines: r.lines.map((l) => ({
          material: variants.get(String(l.materialVariantId))?.name ?? '',
          uom: variants.get(String(l.materialVariantId))?.uom ?? '',
          qty: l.qtyBase,
        })),
      })),
      materialWithMe: [...withMe.values()],
      receivedByCompany: receipts.map((r) => ({
        docNo: r.docNo,
        date: r.docDate,
        received: roundQty(r.lines.reduce((a, l) => a + l.receivedQty, 0)),
        accepted: roundQty(r.lines.reduce((a, l) => a + (l.acceptedQty ?? 0), 0)),
        rejected: roundQty(r.lines.reduce((a, l) => a + (l.rejectedQty ?? 0) + (l.damagedQty ?? 0), 0)),
      })),
      dispatchDeclarations: (slip.dispatchDeclarations ?? []).map((d) => ({
        qty: d.qty,
        note: d.note,
        declaredAt: d.declaredAt,
      })),
      pendingAcknowledgement: issues.some((i) => !i.acknowledgedAt),
    };
  }

  /** Material currently with me (JOB-04's "own V") - cost fields are never included here. */
  @RequirePermissions(PERMISSIONS.PORTAL_JOB_VIEW)
  @Get(':id/material')
  async material(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    this.assertParty(user);
    const slip = await this.ownSlip(id);
    const lines = await this.materialLineModel.find({ jobSlipId: slip._id }).lean();
    const items = await this.lookup.stockItemMaterials(lines.map((l) => l.stockItemId));
    return lines.map((l) => ({
      material: items.get(String(l.stockItemId))?.name,
      uom: items.get(String(l.stockItemId))?.uom,
      bomRole: l.bomRole,
      qtyIssued: l.qtyIssued,
      qtyReturned: l.qtyReturned,
      qtyRemaining: roundQty(l.qtyIssued - l.qtyReturned - l.qtyConsumed - l.qtyWrittenOff),
      // unitCost deliberately omitted (AUTH-07/tech.md §9.4 - the portal never sees a rate or cost).
    }));
  }

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_ACKNOWLEDGE)
  @Idempotent()
  @Post(':id/acknowledge')
  async acknowledge(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertParty(user);
    await this.ownSlip(id);
    const dto = await validateDto(AcknowledgeMaterialIssueDto, body);
    await this.materialIssuesService.acknowledgeLatestForJobSlip(id, dto.discrepancyNote, user.id);
    return this.findOne(id, user);
  }

  @RequirePermissions(PERMISSIONS.PORTAL_JOB_STATUS)
  @Idempotent()
  @Post(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertParty(user);
    await this.ownSlip(id);
    const dto = await validateDto(SetJobSlipStatusDto, body);
    await this.jobSlipsService.setStatus(id, dto.status, user.id);
    return this.findOne(id, user);
  }

  /** BR-14: a declaration is a claim, never stock - company staff confirm the real receipt. */
  @RequirePermissions(PERMISSIONS.PORTAL_JOB_DISPATCH)
  @Idempotent()
  @Post(':id/dispatch-declaration')
  async declareDispatch(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.assertParty(user);
    await this.ownSlip(id);
    const dto = await validateDto(DispatchDeclarationDto, body);
    await this.jobSlipsService.declareDispatch(id, dto.qty, dto.note, user.id);
    return this.findOne(id, user);
  }

  private mapSlip(s: any, design?: any) {
    const expectedQty = roundQty(s.expectedOutputLines.reduce((a: number, l: any) => a + l.expectedQty, 0));
    const open = !['RECEIVED', 'CLOSED', 'CANCELLED'].includes(s.status);
    return {
      id: String(s._id),
      _id: String(s._id),
      slipNumber: s.docNo,
      date: s.docDate,
      jobType: s.jobType,
      designNo: design?.designNo,
      designName: design?.name,
      design: design ? `${design.name} (${design.designNo})` : '',
      expectedQty,
      dueDate: s.expectedCompletionDate ?? null,
      status: s.status,
      overdue: open && !!s.expectedCompletionDate && new Date(s.expectedCompletionDate) < new Date(),
      dispatchedQty: roundQty((s.dispatchDeclarations ?? []).reduce((a: number, d: any) => a + d.qty, 0)),
      // agreedRate / chargeBasis deliberately omitted (AUTH-07).
    };
  }

  /** Loads a slip and enforces party ownership: another party's job (or a bad id) is 404. */
  private async ownSlip(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundProblemException('Job not found.');
    const slip = await this.slipModel.findById(id).lean();
    if (!slip) throw new NotFoundProblemException('Job not found.');
    this.partyScope.assertOwnParty(String(slip.jobWorkerId), RequestContextStore.getOrThrow());
    return slip;
  }

  private assertParty(user: AuthenticatedUser): void {
    if (user.principal !== 'party' || !user.jobWorkerId) {
      throw new ForbiddenException('The portal surface is for factory/artisan accounts only.');
    }
  }
}
