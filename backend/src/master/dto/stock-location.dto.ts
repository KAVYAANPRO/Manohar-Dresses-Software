import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { LOCATION_KINDS } from '../schemas/stock-location.schema';

export class CreateStockLocationDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
  @IsIn(LOCATION_KINDS) kind!: (typeof LOCATION_KINDS)[number];
}

export class UpdateStockLocationDto {
  @IsOptional() @IsString() name?: string;
}
