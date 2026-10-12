import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { Customer, CustomerDocument } from './schemas/customer.schema';

/** Stores the linked sales agent as an ObjectId (aggregations do not cast); '' / null unlinks. */
function castAgent<T>(data: Partial<T>): Partial<T> {
  const d = { ...(data as any) };
  if ('agentId' in d) {
    d.agentId =
      d.agentId && Types.ObjectId.isValid(d.agentId) ? new Types.ObjectId(String(d.agentId)) : null;
  }
  return d;
}

@Injectable()
export class CustomersService extends MasterCrudService<Customer> {
  constructor(@InjectModel(Customer.name) model: Model<CustomerDocument>) {
    super(model);
  }

  override create(data: Partial<Customer>, actorId?: string) {
    return super.create(castAgent(data), actorId);
  }

  override update(id: string, data: Partial<Customer>, actorId?: string, expectedVersion?: number) {
    return super.update(id, castAgent(data), actorId, expectedVersion);
  }
}
