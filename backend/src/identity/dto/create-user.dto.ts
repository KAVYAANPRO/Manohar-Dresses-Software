import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../identity.constants';

export class CreateUserDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  password!: string;

  @IsIn(['internal', 'party'])
  principal!: 'internal' | 'party';

  @IsOptional()
  @IsMongoId()
  jobWorkerId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleKeys!: string[];
}
