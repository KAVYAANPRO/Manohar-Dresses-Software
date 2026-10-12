import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InwardLineInputDto {
  @IsMongoId() purchaseLineId!: string;
  /** Quantity in the purchase line's unit. */
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsString() lotNo?: string;
  /** Rolls (thans) received, each in the line's unit; when given, qty must equal their sum. */
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) @Min(0.001, { each: true }) thans?: number[];
  /**
   * Optional colour actually received, when it differs from the PO line (same material only):
   * a variant id, or a colour id / typed colour name.
   */
  @IsOptional() @IsMongoId() materialVariantId?: string;
  @IsOptional() @IsMongoId() colourId?: string;
  @IsOptional() @IsString() colourName?: string;
}

export class CreateInwardDto {
  @IsMongoId() purchaseId!: string;
  /** Defaults to MAIN-WH. */
  @IsOptional() @IsMongoId() locationId?: string;
  @IsOptional() @IsDateString() docDate?: string;
  @IsOptional() @IsString() supplierRef?: string;
  @IsOptional() @IsString() challanNo?: string;
  /** Blank = next number in the supplier's lot series (e.g. MAH-4). */
  @IsOptional() @IsString() lotNo?: string;
  @IsOptional() @IsString() remarks?: string;
  /** true = create and confirm in one transaction (stock is posted immediately). */
  @IsOptional() @IsBoolean() confirm?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InwardLineInputDto)
  lines!: InwardLineInputDto[];
}

export class DirectInwardLineDto {
  @IsOptional() @IsMongoId() materialVariantId?: string;
  @IsOptional() @IsMongoId() materialId?: string;
  @IsOptional() @IsMongoId() colourId?: string;
  @IsOptional() @IsString() colourName?: string;
  /** Defaults to the material's base unit. */
  @IsOptional() @IsMongoId() uomId?: string;
  @IsNumber() @Min(0.001) qty!: number;
  /** Per `uomId`. Optional (0) when the receiver does not know the price yet. */
  @IsOptional() @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsString() lotNo?: string;
  /** Rolls (thans) received, each in the line's unit; when given, qty must equal their sum. */
  @IsOptional() @IsArray() @IsNumber({}, { each: true }) @Min(0.001, { each: true }) thans?: number[];
}

/**
 * Goods received with no PO raised first. A confirmed purchase is created behind it (Rule 1:
 * stock only ever enters through an inward; INW-04: every inward links to a purchase line),
 * and the inward is confirmed in the same transaction.
 */
export class CreateDirectInwardDto {
  @IsMongoId() supplierId!: string;
  @IsOptional() @IsString() supplierInvoiceNo?: string;
  @IsOptional() @IsString() challanNo?: string;
  /** Blank = next number in the supplier's lot series (e.g. MAH-4). */
  @IsOptional() @IsString() lotNo?: string;
  @IsOptional() @IsDateString() docDate?: string;
  @IsOptional() @IsMongoId() locationId?: string;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DirectInwardLineDto)
  lines!: DirectInwardLineDto[];
}

export class CancelInwardDto {
  @IsString() @MinLength(1) reason!: string;
}
