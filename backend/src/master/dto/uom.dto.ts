import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUomDto {
  @IsString() @MinLength(1) code!: string;
  @IsString() @MinLength(1) name!: string;
}

export class UpdateUomDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
}
