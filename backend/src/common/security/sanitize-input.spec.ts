import { sanitizeInputMiddleware, stripUnsafeKeys } from './sanitize-input';

describe('stripUnsafeKeys', () => {
  it('removes Mongo operator keys at any depth', () => {
    expect(
      stripUnsafeKeys({ status: { $ne: null }, lines: [{ qty: 1, $where: 'x' }], ok: 'yes' }),
    ).toEqual({ status: {}, lines: [{ qty: 1 }], ok: 'yes' });
  });

  it('removes dotted paths and prototype-pollution keys', () => {
    const polluted = JSON.parse('{"a.b":1,"__proto__":{"admin":true},"constructor":1,"c":2}');
    expect(stripUnsafeKeys(polluted)).toEqual({ c: 2 });
    expect(({} as Record<string, unknown>).admin).toBeUndefined();
  });

  it('leaves normal payloads, arrays, dates and primitives untouched', () => {
    const d = new Date('2026-01-01');
    expect(stripUnsafeKeys({ name: 'Cotton - Blue', qty: 5, tags: ['a', 'b'], at: d })).toEqual({
      name: 'Cotton - Blue',
      qty: 5,
      tags: ['a', 'b'],
      at: d,
    });
    expect(stripUnsafeKeys('x')).toBe('x');
    expect(stripUnsafeKeys(null)).toBeNull();
  });
});

describe('sanitizeInputMiddleware', () => {
  it('cleans body and query then calls next', () => {
    const req: any = { body: { $gt: 1, a: 1 }, query: { status: { $ne: 'x' }, q: 'ok' } };
    const next = jest.fn();
    sanitizeInputMiddleware(req, {} as any, next);
    expect(req.body).toEqual({ a: 1 });
    expect(req.query).toEqual({ status: {}, q: 'ok' });
    expect(next).toHaveBeenCalled();
  });
});
