import {
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { CATALOG_TAGS, CatalogTag } from './catalog-item.schema';

export class CreateCatalogItemDto {
  @IsOptional() @IsMongoId() designId?: string;
  @IsString() @MinLength(1) designNameOrNumber!: string;
  @IsNumber() @Min(0.01) salesPrice!: number;
  @IsNumber() @Min(0.01) defaultPrice!: number;
  @IsIn(CATALOG_TAGS as unknown as string[]) tag!: CatalogTag;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) samplePrice?: number;
  @IsOptional() @IsString() designRecipe?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sizes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) colours?: string[];
  @IsOptional() @IsString() hsnCode?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) gstPct?: number;
  @IsOptional() @IsNumber() @Min(0) minStockQty?: number;
  @IsOptional() @IsNumber() @Min(0) minOrderQty?: number;
  @IsOptional() @IsBoolean() outOfStock?: boolean;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) photoUrls?: string[];
}

export class UpdateCatalogItemDto {
  @IsOptional() @IsMongoId() designId?: string | null;
  @IsOptional() @IsString() @MinLength(1) designNameOrNumber?: string;
  @IsOptional() @IsNumber() @Min(0.01) salesPrice?: number;
  @IsOptional() @IsNumber() @Min(0.01) defaultPrice?: number;
  @IsOptional() @IsIn(CATALOG_TAGS as unknown as string[]) tag?: CatalogTag;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) samplePrice?: number;
  @IsOptional() @IsString() designRecipe?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sizes?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) colours?: string[];
  @IsOptional() @IsString() hsnCode?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) gstPct?: number;
  @IsOptional() @IsNumber() @Min(0) minStockQty?: number;
  @IsOptional() @IsNumber() @Min(0) minOrderQty?: number;
  @IsOptional() @IsBoolean() outOfStock?: boolean;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) photoUrls?: string[];
}
