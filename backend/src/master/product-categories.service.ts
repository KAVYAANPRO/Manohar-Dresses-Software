import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MasterCrudService } from '../common/services/master-crud.service';
import { ProductCategory, ProductCategoryDocument } from './schemas/product-category.schema';

@Injectable()
export class ProductCategoriesService extends MasterCrudService<ProductCategory> {
  constructor(@InjectModel(ProductCategory.name) model: Model<ProductCategoryDocument>) {
    super(model);
  }
}
