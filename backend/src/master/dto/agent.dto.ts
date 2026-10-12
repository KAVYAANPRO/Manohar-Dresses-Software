import { IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class CreateAgentDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() agencyName?: string;
  @IsString() @Matches(/^\d{10}$/, { message: 'mobile must be a 10-digit number' }) mobile!: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAgentDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() agencyName?: string;
  @IsOptional() @IsString() @Matches(/^\d{10}$/, { message: 'mobile must be a 10-digit number' }) mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPct?: number;
  @IsOptional() @IsString() notes?: string;
}
