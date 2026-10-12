import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { RETURN_CONDITIONS } from '../schemas/sales-return.schema';

export class SalesReturnLineInputDto {
  @IsMongoId() invoiceLineId!: string;
  @IsNumber() @Min(0.001) qty!: number;
  @IsIn(RETURN_CONDITIONS) condition!: 'GOOD' | 'DAMAGED';
}

export class CreateSalesReturnDto {
  @IsMongoId() invoiceId!: string;
  @IsString() @MinLength(1) reason!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SalesReturnLineInputDto)
  lines!: SalesReturnLineInputDto[];
  @IsOptional() @IsString() notes?: string;
  /** Create and confirm (stock + credit note) in one call. */
  @IsOptional() @IsBoolean() confirm?: boolean;
}

export class CancelSalesReturnDto {
  @IsString() @MinLength(1) reason!: string;
}
