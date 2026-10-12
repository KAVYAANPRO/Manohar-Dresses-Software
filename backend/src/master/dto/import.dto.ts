import { IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export const IMPORTABLE_ENTITIES = [
  'suppliers',
  'customers',
  'materials',
  'job-workers',
  'opening-stock',
] as const;
export type ImportableEntity = (typeof IMPORTABLE_ENTITIES)[number];

export class ImportCsvDto {
  @IsString()
  @MinLength(1)
  csv!: string;
}

/** MST-11 / A-14: opening stock load, the go-live prerequisite the stock formula (§7) starts from. */
export class OpeningStockRowDto {
  @IsMongoId()
  materialVariantId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  qty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  lotNo?: string;

  @IsOptional()
  @IsString()
  locationCode?: string;
}
