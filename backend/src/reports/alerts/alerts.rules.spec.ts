import { canSeeAlert, parsePaymentTermsDays } from './alerts.service';
import { diffImages, describeAction } from '../../audit/audit-log.service';
import { parseRange } from '../../dashboards/dashboards.service';
import { NumberSeriesService } from '../../common/services/number-series.service';

const user = (perms: string[], isSuperAdmin = false) =>
  ({ id: 'u', username: 'u', principal: 'internal', jobWorkerId: null, permissions: new Set(perms), isSuperAdmin, roleKeys: [] }) as any;

describe('alerts rules', () => {
  it('parses payment terms', () => {
    expect(parsePaymentTermsDays('Net 45', 30)).toBe(45);
    expect(parsePaymentTermsDays('30 days', 10)).toBe(30);
    expect(parsePaymentTermsDays('Advance', 30)).toBe(0);
    expect(parsePaymentTermsDays(undefined, 30)).toBe(30);
    expect(parsePaymentTermsDays('as agreed', 21)).toBe(21);
  });

  it('only shows alerts for data the user can see', () => {
    expect(canSeeAlert(user(['stock.view']), 'LOW_RAW_STOCK')).toBe(true);
    expect(canSeeAlert(user(['readystock.view']), 'LOW_RAW_STOCK')).toBe(false);
    expect(canSeeAlert(user([]), 'PAYMENT_OVERDUE')).toBe(false);
    expect(canSeeAlert(user(['payment.view']), 'PAYMENT_OVERDUE')).toBe(true);
    expect(canSeeAlert(user([], true), 'STOCK_DRIFT')).toBe(true);
  });
});

describe('audit change summary', () => {
  it('diffs business fields only', () => {
    const changes = diffImages(
      { name: 'A', version: 1, updatedAt: 'x', rate: 10 },
      { name: 'A', version: 2, updatedAt: 'y', rate: 12 },
    );
    expect(changes).toEqual([{ field: 'rate', before: '10', after: '12' }]);
  });
  it('labels status transitions', () => {
    expect(describeAction('INSERT', null, {})).toBe('Created');
    expect(describeAction('UPDATE', { status: 'DRAFT' }, { status: 'CONFIRMED' })).toBe('Confirmed');
    expect(describeAction('UPDATE', { isActive: true }, { isActive: false })).toBe('Deactivated');
    expect(describeAction('UPDATE', { a: 1 }, { a: 2 })).toBe('Edited');
  });
});

describe('dashboard range', () => {
  it('defaults to 30 days with an equal previous period', () => {
    const r = parseRange();
    const span = r.to.getTime() - r.from.getTime();
    expect(Math.round(span / 86400000)).toBeGreaterThanOrEqual(29);
    expect(r.prevTo.getTime()).toBeLessThan(r.from.getTime());
    expect(Math.abs(r.prevTo.getTime() - r.prevFrom.getTime() - span)).toBeLessThan(5);
  });
  it('falls back when from > to', () => {
    const r = parseRange('2026-12-01', '2026-01-01');
    expect(r.from.getTime()).toBeLessThan(r.to.getTime());
  });
});

describe('number series format change', () => {
  const make = (doc: any) => {
    const model = { findById: jest.fn(async () => doc) };
    return new NumberSeriesService(model as any);
  };
  it('refuses once a number has been issued', async () => {
    const svc = make({ docType: 'INVOICE', fy: '26-27', prefix: 'INV', pad: 5, nextNo: 3 });
    await expect(svc.updateFormat('x', { prefix: 'IN' })).rejects.toMatchObject({ code: 'SERIES_IN_USE' });
  });
  it('enforces the 16-character GST invoice limit', async () => {
    const svc = make({ docType: 'INVOICE', fy: '26-27', prefix: 'INV', pad: 5, nextNo: 1, save: jest.fn(), toObject: () => ({}) });
    await expect(svc.updateFormat('x', { prefix: 'INVOICE', pad: 6 })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('allows a change before first use', async () => {
    const doc: any = { docType: 'JOB_SLIP', fy: '26-27', prefix: 'JS', pad: 5, nextNo: 1, save: jest.fn() };
    doc.toObject = () => ({ prefix: doc.prefix, pad: doc.pad });
    const svc = make(doc);
    await expect(svc.updateFormat('x', { prefix: 'JOB', pad: 4 })).resolves.toEqual({ prefix: 'JOB', pad: 4 });
  });
});
