import { IsString, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../identity.constants';

export class ChangePasswordDto {
  @IsString()
  oldPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH)
  newPassword!: string;
}
