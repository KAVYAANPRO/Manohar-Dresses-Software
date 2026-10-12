import { IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateMaterialDto {
  @IsString() @MinLength(1) name!: string;
  @IsMongoId() categoryId!: string;
  @IsOptional() @IsString() fabricType?: string;
  @IsMongoId() baseUomId!: string;
  @IsOptional() @IsNumber() @Min(0) minStockQty?: number;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsMongoId() categoryId?: string;
  @IsOptional() @IsString() fabricType?: string;
  @IsOptional() @IsMongoId() baseUomId?: string;
  @IsOptional() @IsNumber() @Min(0) minStockQty?: number;
}

/** Either an existing colour (colourId) or a typed colour name (added to the colour master if new). */
export class CreateMaterialVariantDto {
  @IsOptional() @IsMongoId() colourId?: string;
  @IsOptional() @IsString() colourName?: string;
  @IsOptional() @IsString() code?: string;
}
