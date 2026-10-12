import { buildKhataLedger } from './khata-ledger.util';

const d = (s: string) => new Date(s);

describe('buildKhataLedger', () => {
  it('runs earned minus paid in date order, with advances shown as a negative balance', () => {
    const ledger = buildKhataLedger(
      [
        {
          id: 'c1',
          date: d('2026-10-05T10:00:00Z'),
          amount: 12500,
          jobSlipNo: 'JS/1',
          description: 'Manufacturing charges for JS/1: 100 pcs x 125',
        },
      ],
      [
        {
          id: 'p1',
          date: d('2026-10-01T09:00:00Z'),
          kind: 'ADVANCE',
          amount: 5000,
          docNo: 'KPAY/1',
        },
        {
          id: 'p2',
          date: d('2026-10-07T09:00:00Z'),
          kind: 'PAYMENT',
          amount: 7500,
          docNo: 'KPAY/2',
        },
      ],
    );

    expect(ledger.entries.map((e) => [e.type, e.balance])).toEqual([
      ['ADVANCE', -5000],
      ['JOB_CHARGE', 7500],
      ['PAYMENT', 0],
    ]);
    expect(ledger.totals).toEqual({
      earned: 12500,
      advances: 5000,
      payments: 7500,
      paid: 12500,
      balance: 0,
    });
  });

  it('puts a same-day charge before the payment made against it', () => {
    const ledger = buildKhataLedger(
      [{ id: 'c1', date: d('2026-10-05T18:00:00Z'), amount: 1000, description: 'x' }],
      [{ id: 'p1', date: d('2026-10-05T08:00:00Z'), kind: 'PAYMENT', amount: 400, docNo: 'K/1' }],
    );
    expect(ledger.entries.map((e) => e.balance)).toEqual([1000, 600]);
    expect(ledger.totals.balance).toBe(600);
  });

  it('sums money exactly (no float drift)', () => {
    const ledger = buildKhataLedger(
      [
        { id: 'a', date: d('2026-10-01'), amount: 0.1, description: '' },
        { id: 'b', date: d('2026-10-02'), amount: 0.2, description: '' },
      ],
      [],
    );
    expect(ledger.totals.earned).toBe(0.3);
    expect(ledger.entries[1].balance).toBe(0.3);
  });

  it('an empty account is settled', () => {
    expect(buildKhataLedger([], []).totals).toEqual({
      earned: 0,
      advances: 0,
      payments: 0,
      paid: 0,
      balance: 0,
    });
  });
});
