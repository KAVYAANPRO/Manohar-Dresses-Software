import { Types } from 'mongoose';
import { JobSlipStockCheckService } from './job-slip-stock-check.service';
import { JobSlipsService } from './job-slips.service';
import { InsufficientStockException } from '../common/errors/problem.exception';

const DESIGN = new Types.ObjectId().toHexString();
const OTHER_DESIGN = new Types.ObjectId().toHexString();
const WAREHOUSE = new Types.ObjectId();
const COTTON_BLUE = new Types.ObjectId().toHexString();
const LACE_WHITE = new Types.ObjectId().toHexString();
const STOCK_COTTON = new Types.ObjectId().toHexString();
const STOCK_LACE = new Types.ObjectId().toHexString();

interface World {
  boms: Record<string, { materialVariantId: string; qtyPerGarmentBase: number }[] | null>;
  /** variantId -> stockItemId (absent = never inwarded) */
  stockItems: Record<string, string>;
  /** stockItemId -> MAIN-WH lot balances */
  balances: Record<string, number[]>;
  openSlips?: {
    _id: Types.ObjectId;
    designId: string;
    expectedOutputLines: { expectedQty: number }[];
  }[];
  materialLines?: {
    jobSlipId: Types.ObjectId;
    stockItemId: string;
    qtyIssued: number;
    qtyReturned: number;
  }[];
}

const lean = <T>(value: T) => ({ lean: () => Promise.resolve(value) });

function makeService(world: World) {
  const slipModel = {
    find: jest.fn(() => ({ select: () => lean(world.openSlips ?? []) })),
  };
  const materialLineModel = { find: jest.fn(() => lean(world.materialLines ?? [])) };
  const locationModel = { findOne: jest.fn(() => lean({ _id: WAREHOUSE, code: 'MAIN-WH' })) };
  const variantRows = [
    {
      _id: new Types.ObjectId(COTTON_BLUE),
      materialId: { name: 'Cotton', baseUomId: { code: 'M' } },
      colourId: { name: 'Blue' },
    },
    {
      _id: new Types.ObjectId(LACE_WHITE),
      materialId: { name: 'Lace', baseUomId: { code: 'M' } },
      colourId: { name: 'White' },
    },
  ];
  const variantQuery: any = {
    populate: () => variantQuery,
    lean: () => Promise.resolve(variantRows),
  };
  const variantModel = { find: jest.fn(() => variantQuery) };
  const designsService = {
    getCurrentBom: jest.fn(async (designId: string) => {
      const lines = world.boms[designId];
      return lines ? { lines } : null;
    }),
  };
  const stockItemsService = {
    list: jest.fn(async (filter: { materialVariantId: string }) => {
      const id = world.stockItems[String(filter.materialVariantId)];
      return id ? [{ _id: new Types.ObjectId(id) }] : [];
    }),
  };
  const stockQueryService = {
    balances: jest.fn(async (filter: { stockItemId: string; locationId: string }) => {
      expect(filter.locationId).toBe(String(WAREHOUSE));
      return (world.balances[filter.stockItemId] ?? []).map((qty) => ({ qty }));
    }),
  };

  const service = new JobSlipStockCheckService(
    slipModel as any,
    materialLineModel as any,
    locationModel as any,
    variantModel as any,
    designsService as any,
    stockItemsService as any,
    stockQueryService as any,
  );
  return { service, designsService, stockQueryService };
}

const manufacturing = (qtys: number[], designId = DESIGN) => ({
  jobType: 'MANUFACTURING' as const,
  designId,
  expectedOutputLines: qtys.map((expectedQty) => ({ expectedQty })),
});

async function captureError(p: Promise<unknown>): Promise<InsufficientStockException> {
  try {
    await p;
  } catch (err) {
    return err as InsufficientStockException;
  }
  throw new Error('expected the stock check to throw');
}

describe('JobSlipStockCheckService.assertMaterialsAvailable', () => {
  it('blocks a MANUFACTURING slip when the BOM material has not been inwarded yet', async () => {
    const { service } = makeService({
      boms: { [DESIGN]: [{ materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 2.5 }] },
      stockItems: {},
      balances: {},
    });

    const err = await captureError(service.assertMaterialsAvailable(manufacturing([40, 60])));
    expect(err).toBeInstanceOf(InsufficientStockException);
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(err.message).toBeDefined();
    const body = err.getResponse() as any;
    expect(body.detail).toContain('Cotton - Blue: required 250 M, available 0 M');
    expect(body.shortages).toEqual([
      {
        materialVariantId: COTTON_BLUE,
        name: 'Cotton - Blue',
        required: 250,
        available: 0,
        uom: 'M',
        onHand: 0,
        reservedByOpenJobSlips: 0,
        shortBy: 250,
      },
    ]);
  });

  it('blocks when stock exists but is less than required', async () => {
    const { service } = makeService({
      boms: { [DESIGN]: [{ materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 2 }] },
      stockItems: { [COTTON_BLUE]: STOCK_COTTON },
      balances: { [STOCK_COTTON]: [50, 49] },
    });
    const err = await captureError(service.assertMaterialsAvailable(manufacturing([50])));
    expect(err).toBeInstanceOf(InsufficientStockException);
    expect((err.getResponse() as any).shortages[0]).toMatchObject({
      required: 100,
      available: 99,
      shortBy: 1,
    });
  });

  it('allows the slip when MAIN-WH has enough of every BOM material (summed across lots)', async () => {
    const { service } = makeService({
      boms: {
        [DESIGN]: [
          { materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 2 },
          { materialVariantId: LACE_WHITE, qtyPerGarmentBase: 0.5 },
        ],
      },
      stockItems: { [COTTON_BLUE]: STOCK_COTTON, [LACE_WHITE]: STOCK_LACE },
      balances: { [STOCK_COTTON]: [120, 80], [STOCK_LACE]: [50] },
    });
    await expect(
      service.assertMaterialsAvailable(manufacturing([40, 60])),
    ).resolves.toBeUndefined();
  });

  it('with several materials, names only the one that is short', async () => {
    const { service } = makeService({
      boms: {
        [DESIGN]: [
          { materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 2 },
          { materialVariantId: LACE_WHITE, qtyPerGarmentBase: 1 },
        ],
      },
      stockItems: { [COTTON_BLUE]: STOCK_COTTON, [LACE_WHITE]: STOCK_LACE },
      balances: { [STOCK_COTTON]: [500], [STOCK_LACE]: [30] },
    });
    const err = await captureError(service.assertMaterialsAvailable(manufacturing([100])));
    const body = err.getResponse() as any;
    expect(body.shortages).toHaveLength(1);
    expect(body.shortages[0]).toMatchObject({
      materialVariantId: LACE_WHITE,
      name: 'Lace - White',
      required: 100,
      available: 30,
      uom: 'M',
    });
    expect(body.detail).toContain('Lace - White');
    expect(body.detail).not.toContain('Cotton - Blue');
  });

  it('sums BOM lines that use the same material variant (e.g. Top + Bottom in the same fabric)', async () => {
    const { service } = makeService({
      boms: {
        [DESIGN]: [
          { materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 1.5 },
          { materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 1 },
        ],
      },
      stockItems: { [COTTON_BLUE]: STOCK_COTTON },
      balances: { [STOCK_COTTON]: [240] },
    });
    const err = await captureError(service.assertMaterialsAvailable(manufacturing([100])));
    expect((err.getResponse() as any).shortages[0]).toMatchObject({
      required: 250,
      available: 240,
    });
  });

  it('subtracts material still owed to other open slips (BOM requirement minus net issued)', async () => {
    const openA = new Types.ObjectId();
    const openB = new Types.ObjectId();
    const { service } = makeService({
      boms: {
        [DESIGN]: [{ materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 2 }],
        [OTHER_DESIGN]: [{ materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 1 }],
      },
      stockItems: { [COTTON_BLUE]: STOCK_COTTON },
      balances: { [STOCK_COTTON]: [300] },
      openSlips: [
        // needs 100, nothing issued yet -> reserves 100
        { _id: openA, designId: DESIGN, expectedOutputLines: [{ expectedQty: 50 }] },
        // needs 80, 70 issued and 10 returned (net 60) -> reserves 20
        { _id: openB, designId: OTHER_DESIGN, expectedOutputLines: [{ expectedQty: 80 }] },
      ],
      materialLines: [
        { jobSlipId: openB, stockItemId: STOCK_COTTON, qtyIssued: 70, qtyReturned: 10 },
      ],
    });

    // 300 on hand - 120 reserved = 180 available; 100 pcs x 2 m = 200 required.
    const err = await captureError(service.assertMaterialsAvailable(manufacturing([100])));
    const body = err.getResponse() as any;
    expect(body.shortages[0]).toMatchObject({
      required: 200,
      onHand: 300,
      reservedByOpenJobSlips: 120,
      available: 180,
      shortBy: 20,
    });
    expect(body.detail).toContain('reserved by other open job slips');

    // 90 pcs x 2 m = 180 fits exactly.
    await expect(service.assertMaterialsAvailable(manufacturing([90]))).resolves.toBeUndefined();
  });

  it('allows the slip (no crash) when the design has no active BOM', async () => {
    const { service, stockQueryService } = makeService({
      boms: { [DESIGN]: null },
      stockItems: {},
      balances: {},
    });
    await expect(service.assertMaterialsAvailable(manufacturing([10]))).resolves.toBeUndefined();
    expect(stockQueryService.balances).not.toHaveBeenCalled();
  });

  it('does not check PROCESSING slips (their materialVariantId is the output, not the input)', async () => {
    const { service, designsService } = makeService({
      boms: { [DESIGN]: [{ materialVariantId: COTTON_BLUE, qtyPerGarmentBase: 2 }] },
      stockItems: {},
      balances: {},
    });
    await expect(
      service.assertMaterialsAvailable({
        jobType: 'PROCESSING',
        designId: DESIGN,
        expectedOutputLines: [{ expectedQty: 100 }],
      }),
    ).resolves.toBeUndefined();
    expect(designsService.getCurrentBom).not.toHaveBeenCalled();
  });
});

describe('JobSlipsService.create stock gate', () => {
  it('does not consume a document number or create the slip when stock is short', async () => {
    const model = { create: jest.fn() };
    const numberSeries = { ensureSeries: jest.fn(), next: jest.fn() };
    const companySettings = { get: jest.fn(async () => ({ currentFinancialYear: '2026' })) };
    const stockCheck = {
      assertMaterialsAvailable: jest.fn(async () => {
        throw new InsufficientStockException('short');
      }),
    };
    const service = new JobSlipsService(
      model as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      numberSeries as any,
      companySettings as any,
      {} as any,
      stockCheck as any,
    );

    await expect(
      service.create(
        {
          jobType: 'MANUFACTURING',
          jobWorkerId: new Types.ObjectId().toHexString(),
          designId: DESIGN,
          expectedOutputLines: [{ expectedQty: 10 }],
          chargeBasis: 'PER_PIECE',
          agreedRate: 80,
        },
        new Types.ObjectId().toHexString(),
      ),
    ).rejects.toBeInstanceOf(InsufficientStockException);
    expect(numberSeries.next).not.toHaveBeenCalled();
    expect(model.create).not.toHaveBeenCalled();
  });
});
