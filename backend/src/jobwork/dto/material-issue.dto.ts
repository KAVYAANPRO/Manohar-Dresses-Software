import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MaterialIssueLineInputDto {
  @IsMongoId() materialVariantId!: string;
  @IsOptional() @IsString() bomRole?: string;
  @IsNumber() @Min(0.001) qtyBase!: number;
  @IsOptional() @IsMongoId() lotId?: string;
}

export class CreateMaterialIssueDto {
  @IsMongoId() jobSlipId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialIssueLineInputDto)
  lines!: MaterialIssueLineInputDto[];
  @IsOptional() @IsString() notes?: string;
}

export class CancelMaterialIssueDto {
  @IsString() @MinLength(1) reason!: string;
}

export class AcknowledgeMaterialIssueDto {
  @IsOptional() @IsString() discrepancyNote?: string;
}
