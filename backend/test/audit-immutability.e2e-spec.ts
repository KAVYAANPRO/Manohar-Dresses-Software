import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createTestApp, closeTestApp, TestContext } from './utils/test-app';
import { AuditLog, AuditLogDocument } from '../src/audit/schemas/audit-log.schema';

describe('audit_log is append-only (AUD-01/AUD-02, tech.md §9.5 - Mongo stand-in for forbid_mutation())', () => {
  let ctx: TestContext;
  let model: Model<AuditLogDocument>;

  beforeAll(async () => {
    ctx = await createTestApp();
    model = ctx.app.get(getModelToken(AuditLog.name));
    await model.create({ module: 'test', action: 'INSERT', entityType: 'Test', entityId: '1' });
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  it('rejects updateOne/updateMany/findOneAndUpdate', async () => {
    await expect(
      model.updateOne({ entityType: 'Test' }, { $set: { action: 'HACKED' } }),
    ).rejects.toThrow(/append-only/);
    await expect(model.updateMany({}, { $set: { action: 'HACKED' } })).rejects.toThrow(
      /append-only/,
    );
    await expect(
      model.findOneAndUpdate({ entityType: 'Test' }, { $set: { action: 'HACKED' } }),
    ).rejects.toThrow(/append-only/);
  });

  it('rejects deleteOne/deleteMany/findOneAndDelete', async () => {
    await expect(model.deleteOne({ entityType: 'Test' })).rejects.toThrow(/append-only/);
    await expect(model.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(model.findOneAndDelete({ entityType: 'Test' })).rejects.toThrow(/append-only/);
  });

  it('still allows inserts', async () => {
    const doc = await model.create({
      module: 'test',
      action: 'INSERT',
      entityType: 'Test',
      entityId: '2',
    });
    expect(doc._id).toBeDefined();
  });
});
