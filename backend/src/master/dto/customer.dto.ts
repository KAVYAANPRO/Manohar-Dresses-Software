import { IsMongoId, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() businessName?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) defaultDiscountPct?: number;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsMongoId() agentId?: string | null;
}

export class UpdateCustomerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() businessName?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() billingAddress?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) defaultDiscountPct?: number;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsMongoId() agentId?: string | null;
}
