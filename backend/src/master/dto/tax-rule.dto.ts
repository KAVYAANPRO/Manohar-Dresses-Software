import { IsDateString, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateTaxRuleDto {
  @IsString() @MinLength(1) hsn!: string;
  @IsNumber() @Min(0) valueBandMin!: number;
  @IsOptional() @IsNumber() @Min(0) valueBandMax?: number;
  @IsNumber() @Min(0) @Max(100) ratePct!: number;
  @IsDateString() validFrom!: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateTaxRuleDto {
  @IsOptional() @IsString() hsn?: string;
  @IsOptional() @IsNumber() @Min(0) valueBandMin?: number;
  @IsOptional() @IsNumber() @Min(0) valueBandMax?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) ratePct?: number;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
  @IsOptional() @IsString() notes?: string;
}
