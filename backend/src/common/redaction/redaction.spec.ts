import { Types } from 'mongoose';
import { REDACT, fieldsToRedact, redactFor, stripFields } from './redaction';
import { PERMISSIONS } from '../../identity/permissions.catalogue';

describe('field-level redaction (AUTH-07)', () => {
  const purchase = {
    _id: new Types.ObjectId(),
    docNo: 'PO-1',
    createdAt: new Date('2026-01-01'),
    otherCharges: 50,
    lines: [
      {
        qty: 10,
        rate: 120,
        amount: 1200,
        landedUnitCost: 125,
        materialVariantId: new Types.ObjectId(),
      },
    ],
  };

  it('strips money fields at any depth for a caller without the permission', () => {
    const out = redactFor(purchase, [REDACT.PURCHASE_RATES], {
      permissions: new Set([PERMISSIONS.PURCHASE_VIEW]),
    });
    expect(out).not.toHaveProperty('otherCharges');
    expect(out.lines[0]).toEqual({
      qty: 10,
      materialVariantId: purchase.lines[0].materialVariantId,
    });
    expect(out._id).toBe(purchase._id);
    expect(out.createdAt).toBe(purchase.createdAt);
    // never mutates the source
    expect(purchase.lines[0].rate).toBe(120);
  });

  it('keeps everything for a caller holding any unlocking key, and for super admin', () => {
    expect(
      redactFor(purchase, [REDACT.PURCHASE_RATES], {
        permissions: new Set([PERMISSIONS.PURCHASE_RATES_VIEW]),
      }),
    ).toBe(purchase);
    expect(
      redactFor(purchase, [REDACT.PURCHASE_RATES], { permissions: new Set(), isSuperAdmin: true }),
    ).toBe(purchase);
    expect(fieldsToRedact([REDACT.JOBWORK_MONEY], new Set([PERMISSIONS.JOBSLIP_EDIT])).size).toBe(
      0,
    );
  });

  it('fails closed with no user', () => {
    expect(redactFor({ unitCost: 5, qty: 1 }, [REDACT.STOCK_VALUE], null)).toEqual({ qty: 1 });
  });

  it('serialises Mongoose-like documents through toJSON before stripping', () => {
    class FakeDoc {
      toObject() {
        return {};
      }
      toJSON() {
        return { agreedRate: 9, docNo: 'JS-1' };
      }
    }
    const doc = new FakeDoc();
    expect(stripFields(doc, new Set(['agreedRate']))).toEqual({ docNo: 'JS-1' });
  });
});
