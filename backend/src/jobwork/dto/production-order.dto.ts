import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ProductionOrderQuantityInputDto {
  @IsMongoId() colourId!: string;
  @IsMongoId() sizeId!: string;
  @IsNumber() @Min(1) qty!: number;
}

export class CreateProductionOrderDto {
  @IsMongoId() designId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductionOrderQuantityInputDto)
  quantities!: ProductionOrderQuantityInputDto[];

  @IsOptional() @IsDateString() plannedStartDate?: string;
  @IsOptional() @IsDateString() plannedEndDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CancelProductionOrderDto {
  @IsString() @MinLength(1) reason!: string;
}
