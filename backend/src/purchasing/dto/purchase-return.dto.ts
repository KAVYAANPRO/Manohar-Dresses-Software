import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class PurchaseReturnLineInputDto {
  @IsMongoId() inwardLineId!: string;
  /** In the material's base unit (the unit the lot is held in). */
  @IsNumber() @Min(0.001) qty!: number;
}

export class CreatePurchaseReturnDto {
  /** The confirmed inward the goods came in on (PUR-08: Purchase -> Inward -> Return). */
  @IsMongoId() inwardId!: string;
  /** Where the goods are being sent back from. Defaults to the inward's location. */
  @IsOptional() @IsMongoId() locationId?: string;
  @IsOptional() @IsDateString() docDate?: string;
  @IsString() @MinLength(1) reason!: string;
  @IsOptional() @IsString() remarks?: string;
  /** true = create and confirm (stock out + debit note) in one transaction. */
  @IsOptional() @IsBoolean() confirm?: boolean;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnLineInputDto)
  lines!: PurchaseReturnLineInputDto[];
}

export class CancelPurchaseReturnDto {
  @IsString() @MinLength(1) reason!: string;
}
