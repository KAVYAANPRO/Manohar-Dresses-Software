import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateColourDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() hexCode?: string;
}

export class UpdateColourDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() hexCode?: string;
}
