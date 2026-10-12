import { IsArray, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];
}
