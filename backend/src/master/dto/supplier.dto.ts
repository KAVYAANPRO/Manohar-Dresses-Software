import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() paymentTerms?: string;
}
