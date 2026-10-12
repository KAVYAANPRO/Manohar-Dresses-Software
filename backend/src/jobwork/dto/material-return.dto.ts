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
  ValidateNested,
} from 'class-validator';

export class MaterialReturnLineInputDto {
  @IsMongoId() materialVariantId!: string;
  /** Omit to return across this job's own lots of the variant, oldest first. */
  @IsOptional() @IsMongoId() lotId?: string;
  @IsNumber() @Min(0.001) qtyBase!: number;
}

export class CreateMaterialReturnDto {
  @IsMongoId() jobSlipId!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialReturnLineInputDto)
  lines!: MaterialReturnLineInputDto[];
  @IsOptional() @IsString() notes?: string;
  /** Convenience: create and confirm in one call. */
  @IsOptional() @IsBoolean() confirm?: boolean;
}
