import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSizeDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateSizeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() sortOrder?: number;
}
