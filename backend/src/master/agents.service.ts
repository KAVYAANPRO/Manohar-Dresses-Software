import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { SalesAgent, SalesAgentDocument } from './schemas/agent.schema';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { roundMoney } from '../common/utils/decimal';

@Injectable()
export class AgentsService extends MasterCrudService<SalesAgent> {
  constructor(
    @InjectModel(SalesAgent.name) model: Model<SalesAgentDocument>,
    @InjectModel(Customer.name) private readonly customerModel: Model<CustomerDocument>,
  ) {
    super(model);
  }

  /** List with the number of linked customers, for the agent master screen. */
  async listWithCounts(filter: Record<string, unknown> = {}) {
    const agents = await this.model.find(filter).sort({ name: 1 }).lean();
    const counts = await this.customerModel.aggregate([
      { $match: { agentId: { $in: agents.flatMap((a: any) => [a._id, String(a._id)]) } } },
      { $group: { _id: { $toString: '$agentId' }, n: { $sum: 1 } } },
    ]);
    const byAgent = new Map(counts.map((c) => [String(c._id), c.n as number]));
    return agents.map((a: any) => ({ ...a, customerCount: byAgent.get(String(a._id)) ?? 0 }));
  }

  /** Agent detail: linked customers plus commission earned on confirmed invoices. */
  async summary(id: string) {
    const agent: any = await this.findById(id);
    const customers = await this.customerModel
      .find({ agentId: { $in: [new Types.ObjectId(id), id] } } as any)
      .select('name businessName mobile state isActive')
      .sort({ name: 1 })
      .lean();
    const invoices = await this.model.db
      .collection('invoices')
      .find({ agentId: new Types.ObjectId(id), status: 'CONFIRMED' })
      .project({ docNo: 1, docDate: 1, customerNameSnapshot: 1, taxableTotal: 1, grandTotal: 1, commissionPct: 1, commissionAmount: 1 })
      .sort({ docDate: -1 })
      .limit(200)
      .toArray();
    const totalCommission = roundMoney(
      invoices.reduce((s, i: any) => s + (i.commissionAmount ?? 0), 0),
    );
    const totalSales = roundMoney(invoices.reduce((s, i: any) => s + (i.taxableTotal ?? 0), 0));
    return { agent, customers, invoices, totalSales, totalCommission };
  }
}
