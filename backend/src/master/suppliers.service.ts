import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { Supplier, SupplierDocument } from './schemas/supplier.schema';

@Injectable()
export class SuppliersService extends MasterCrudService<Supplier> {
  constructor(@InjectModel(Supplier.name) model: Model<SupplierDocument>) {
    super(model);
  }
}
