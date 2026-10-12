import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { CHALLAN_PURPOSES } from '../schemas/delivery-challan.schema';

export class ChallanLineInputDto {
  @IsMongoId() designVariantId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitRate?: number;
}

export class CreateDeliveryChallanDto {
  @IsMongoId() customerId!: string;
  @IsOptional() @IsMongoId() salesOrderId?: string;
  @IsOptional() @IsIn(CHALLAN_PURPOSES) purpose?: string;
  @IsOptional() @IsString() transportName?: string;
  @IsOptional() @IsString() vehicleNumber?: string;
  @IsOptional() @IsString() notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChallanLineInputDto)
  lines!: ChallanLineInputDto[];
  /** Create and dispatch (move the stock out) in one call. */
  @IsOptional() @IsBoolean() dispatch?: boolean;
}

export class ChallanReturnLineDto {
  @IsMongoId() lineId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsIn(['GOOD', 'DAMAGED']) condition!: 'GOOD' | 'DAMAGED';
}

export class ChallanReturnDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChallanReturnLineDto)
  lines!: ChallanReturnLineDto[];
  @IsOptional() @IsString() note?: string;
}

export class ChallanInvoiceLineDto {
  @IsMongoId() lineId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsOptional() @IsNumber() @Min(0) unitRate?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPct?: number;
}

export class ChallanInvoiceDto {
  /** Omit to bill everything still with the customer. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChallanInvoiceLineDto)
  lines?: ChallanInvoiceLineDto[];
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class CancelChallanDto {
  @IsString() @MinLength(1) reason!: string;
}
