import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_MODES } from '../schemas/payment.schema';

export class PaymentAllocationInputDto {
  @IsMongoId() invoiceId!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

export class RecordPaymentDto {
  @IsMongoId() customerId!: string;
  @IsISO8601() date!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsIn(PAYMENT_MODES) mode!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationInputDto)
  @ArrayMinSize(1)
  allocations?: PaymentAllocationInputDto[];
}

/** Allocate (part of) an unallocated receipt / advance to an invoice later. */
export class AllocatePaymentDto {
  @IsMongoId() invoiceId!: string;
  @IsNumber() @Min(0.01) amount!: number;
}
