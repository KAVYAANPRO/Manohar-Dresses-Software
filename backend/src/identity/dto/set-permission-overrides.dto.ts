import { IsArray, IsString } from 'class-validator';

export class SetPermissionOverridesDto {
  @IsArray()
  @IsString({ each: true })
  allow!: string[];

  @IsArray()
  @IsString({ each: true })
  deny!: string[];
}
