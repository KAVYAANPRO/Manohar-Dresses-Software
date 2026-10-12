import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { Colour, ColourDocument } from './schemas/colour.schema';

@Injectable()
export class ColoursService extends MasterCrudService<Colour> {
  constructor(@InjectModel(Colour.name) model: Model<ColourDocument>) {
    super(model);
  }
}
