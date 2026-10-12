import { createTestApp, closeTestApp, TestContext } from './utils/test-app';
import { NumberSeriesService } from '../src/common/services/number-series.service';

describe('NumberSeries (tech.md §4.4 / SAL-06: gapless, no duplicates under concurrency)', () => {
  let ctx: TestContext;
  let service: NumberSeriesService;

  beforeAll(async () => {
    ctx = await createTestApp();
    service = ctx.app.get(NumberSeriesService);
    await service.ensureSeries('INVOICE', '26-27', 'INV', 5);
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('allocates gapless, sequential numbers under concurrent callers', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => service.next('INVOICE', '26-27')),
    );
    const sequenceNumbers = results
      .map((r) => parseInt(r.split('/').pop() as string, 10))
      .sort((a, b) => a - b);

    expect(new Set(sequenceNumbers).size).toBe(25); // no duplicates
    expect(sequenceNumbers[0]).toBe(1);
    expect(sequenceNumbers[24]).toBe(25); // no gaps
  });

  it('throws NUMBER_SERIES_MISSING for an unconfigured series', async () => {
    await expect(service.next('PURCHASE', '26-27')).rejects.toMatchObject({
      code: 'NUMBER_SERIES_MISSING',
    });
  });
});
