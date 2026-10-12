import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { MaterialCategory, MaterialCategoryDocument } from './schemas/material-category.schema';

@Injectable()
export class MaterialCategoriesService extends MasterCrudService<MaterialCategory> {
  constructor(@InjectModel(MaterialCategory.name) model: Model<MaterialCategoryDocument>) {
    super(model);
  }
}
