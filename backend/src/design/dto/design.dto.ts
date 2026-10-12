import {
  ArrayNotEmpty,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateDesignDto {
  @IsString() @MinLength(1) designNo!: string;
  @IsString() @MinLength(1) name!: string;
  @IsMongoId() productCategoryId!: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsString() description?: string;

  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) colourOptions!: string[];
  @IsArray() @ArrayNotEmpty() @IsMongoId({ each: true }) sizeOptions!: string[];

  @IsOptional() @IsNumber() @Min(0) expectedProductionQty?: number;
  @IsOptional() @IsString() manufacturingInstructions?: string;
  @IsOptional() @IsNumber() @Min(0) defaultSellingRate?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() hsn?: string;
}

export class UpdateDesignDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsMongoId() productCategoryId?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) colourOptions?: string[];
  @IsOptional() @IsArray() @IsMongoId({ each: true }) sizeOptions?: string[];
  @IsOptional() @IsNumber() @Min(0) expectedProductionQty?: number;
  @IsOptional() @IsString() manufacturingInstructions?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() hsn?: string;
}

export class SetDesignRateDto {
  @IsNumber() @Min(0) rate!: number;
}
