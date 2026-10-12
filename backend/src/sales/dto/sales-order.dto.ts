import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SalesOrderLineInputDto {
  @IsMongoId() designVariantId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
  @IsOptional() @IsNumber() @Min(0) extraDiscountAmt?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) extraDiscountPct?: number;
}

export class CreateSalesOrderDto {
  @IsMongoId() customerId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineInputDto)
  lines!: SalesOrderLineInputDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsMongoId() agentId?: string;
  @IsOptional() @IsString() customerRefNo?: string;
  @IsOptional() @IsString() transportName?: string;
  @IsOptional() @IsISO8601() expectedDate?: string;
  @IsOptional() @IsNumber() @Min(0) shippingCharge?: number;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  /** Convenience: create and immediately confirm (ATP-checked). */
  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class CancelSalesOrderDto {
  @IsString() @MinLength(1) reason!: string;
}
