import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class JobReceiptLineInputDto {
  @IsOptional() @IsMongoId() colourId?: string;
  @IsOptional() @IsMongoId() sizeId?: string;
  @IsOptional() @IsMongoId() materialVariantId?: string;

  @IsNumber() @Min(0) receivedQty!: number;
  @IsOptional() @IsNumber() @Min(0) acceptedQty?: number;
  @IsOptional() @IsNumber() @Min(0) rejectedQty?: number;
  @IsOptional() @IsNumber() @Min(0) damagedQty?: number;
}

export class CreateJobReceiptDto {
  @IsMongoId() jobSlipId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => JobReceiptLineInputDto)
  lines!: JobReceiptLineInputDto[];
  @IsOptional() @IsNumber() @Min(0) otherCharges?: number;
  /** JOB-09 manufacturing/processing charge for this receipt; needs receipt.charges.edit. */
  @IsOptional() @IsNumber() @Min(0) manufacturingCharges?: number;
  @IsOptional() @IsString() remarks?: string;
  /** Receiving beyond expected (+ tolerance) is blocked unless this is set with remarks. */
  @IsOptional() @IsBoolean() allowOverReceipt?: boolean;
  @IsOptional() @IsString() shortageReason?: string;
  /** Convenience: create and confirm in one call (the receiving screen's "Confirm & Post"). */
  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class CancelJobReceiptDto {
  @IsString() @MinLength(1) reason!: string;
}
