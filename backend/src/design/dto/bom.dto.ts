import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsMongoId,
  IsNumber,
  Min,
  MinLength,
  ValidateNested,
  IsString,
} from 'class-validator';

export class BomLineInputDto {
  @IsString() @MinLength(1) role!: string;
  @IsMongoId() materialVariantId!: string;
  @IsNumber() @Min(0.001) qtyPerGarmentBase!: number;
  @IsNumber() @Min(0) allowancePct: number = 0;
}

export class SetBomDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineInputDto)
  lines!: BomLineInputDto[];
}
