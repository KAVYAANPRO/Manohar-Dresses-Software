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

/**
 * A line names the material variant directly, or a material plus a colour (colourId, or a
 * typed colourName which is added to the colour master if new). `uomId` defaults to the
 * material's base unit.
 */
export class PurchaseLineInputDto {
  @IsOptional() @IsMongoId() materialVariantId?: string;
  @IsOptional() @IsMongoId() materialId?: string;
  @IsOptional() @IsMongoId() colourId?: string;
  @IsOptional() @IsString() colourName?: string;
  @IsOptional() @IsMongoId() uomId?: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsNumber() @Min(0) rate!: number;
}

export class CreatePurchaseDto {
  @IsMongoId() supplierId!: string;
  @IsOptional() @IsString() supplierInvoiceNo?: string;
  @IsOptional() @IsDateString() docDate?: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineInputDto)
  lines!: PurchaseLineInputDto[];
}

export class UpdatePurchaseDto {
  @IsOptional() @IsMongoId() supplierId?: string;
  @IsOptional() @IsString() supplierInvoiceNo?: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineInputDto)
  lines?: PurchaseLineInputDto[];
}

export class CancelPurchaseDto {
  @IsString() @MinLength(1) reason!: string;
}
