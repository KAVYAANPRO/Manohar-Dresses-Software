import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InvoiceLineInputDto {
  @IsOptional() @IsMongoId() salesOrderLineId?: string;
  @IsMongoId() designVariantId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
  @IsOptional() @IsNumber() @Min(0) extraDiscountAmt?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) extraDiscountPct?: number;
}

export class CreateInvoiceDto {
  @IsMongoId() customerId!: string;
  @IsOptional() @IsMongoId() salesOrderId?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsMongoId() agentId?: string;
  @IsOptional() @IsString() transportName?: string;
  /** Convenience: create and immediately confirm in one call. */
  @IsOptional() @IsBoolean() confirm?: boolean;
}

/** Pricing preview: same lines as an invoice, nothing persisted. */
export class PreviewInvoiceDto {
  @IsMongoId() customerId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineInputDto)
  lines!: InvoiceLineInputDto[];
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
}

export class CancelInvoiceDto {
  @IsString() @MinLength(1) reason!: string;
}
