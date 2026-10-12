import { IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class EnsureNumberSeriesDto {
  @IsString() @MinLength(1) docType!: string;
  @IsString() @MinLength(1) fy!: string;
  @IsString() @MinLength(1) prefix!: string;
  @IsOptional() @IsInt() @Min(1) pad?: number;
}

export class UpdateNumberSeriesDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,8}$/, { message: 'prefix must be 1-8 letters, digits or dashes' })
  prefix?: string;

  @IsOptional() @IsInt() @Min(1) @Max(8) pad?: number;
}
