import { IsOptional, IsString, MinLength } from 'class-validator';

/** Shared by the simple {name}-only masters: material categories, colours, product categories, processing types. */
export class CreateNamedEntityDto {
  @IsString()
  @MinLength(1)
  name!: string;
}

export class UpdateNamedEntityDto {
  @IsOptional()
  @IsString()
  name?: string;
}
