import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { Size, SizeDocument } from './schemas/size.schema';

@Injectable()
export class SizesService extends MasterCrudService<Size> {
  constructor(@InjectModel(Size.name) model: Model<SizeDocument>) {
    super(model);
  }

  list(filter: FilterQuery<Size> = {}): Promise<Size[]> {
    return this.model.find(filter).sort({ sortOrder: 1, name: 1 }).lean<Size[]>();
  }
}
