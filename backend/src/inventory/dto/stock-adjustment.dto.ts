import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ProposeStockAdjustmentDto {
  @IsMongoId() stockItemId!: string;
  @IsMongoId() locationId!: string;
  @IsIn(['IN', 'OUT']) direction!: 'IN' | 'OUT';
  @IsNumber() @Min(0.001) qty!: number;
  @IsString() @MinLength(1) reason!: string;
  @IsOptional() @IsMongoId() lotId?: string;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
}

export class RejectStockAdjustmentDto {
  @IsString() @MinLength(1) reason!: string;
}
