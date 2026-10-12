import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { ProcessingType, ProcessingTypeDocument } from './schemas/processing-type.schema';

@Injectable()
export class ProcessingTypesService extends MasterCrudService<ProcessingType> {
  constructor(@InjectModel(ProcessingType.name) model: Model<ProcessingTypeDocument>) {
    super(model);
  }
}
