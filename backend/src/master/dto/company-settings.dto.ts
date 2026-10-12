import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateCompanySettingsDto {
  @IsOptional() @IsString() @MinLength(1) legalName?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() currentFinancialYear?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) overReceiptTolerancePct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) shortageTolerancePct?: number;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() ownerWhatsapp?: string;
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'financialYearStart must be MM-DD' })
  financialYearStart?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) pendingJobAlertDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) materialPendingAlertDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) pendingInwardAlertDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(365) pendingSalesOrderAlertDays?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) defaultPaymentTermsDays?: number;
}
