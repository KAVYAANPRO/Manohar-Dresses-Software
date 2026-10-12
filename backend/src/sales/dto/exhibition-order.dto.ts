import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_MODES } from '../schemas/payment.schema';

export class ExhibitionLineInputDto {
  @IsMongoId() designVariantId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
}

export class CreateExhibitionOrderDto {
  @IsString() @MinLength(1) exhibitionName!: string;
  @IsOptional() @IsString() location?: string;
  @IsString() @MinLength(1) customerName!: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsMongoId() customerId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExhibitionLineInputDto)
  lines!: ExhibitionLineInputDto[];
  @IsOptional() @IsNumber() @Min(0) amountCollected?: number;
  @IsOptional() @IsIn(PAYMENT_MODES) paymentMode?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ConvertExhibitionOrderDto {
  @IsIn(['SALES_ORDER', 'INVOICE']) target!: 'SALES_ORDER' | 'INVOICE';
  /** Existing customer; when omitted one is found by mobile or created from the walk-in details. */
  @IsOptional() @IsMongoId() customerId?: string;
}

export class CancelExhibitionOrderDto {
  @IsString() @MinLength(1) reason!: string;
}
