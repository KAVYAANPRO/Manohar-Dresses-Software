import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateJobWorkerDto {
  @IsString() @MinLength(1) name!: string;
  @IsIn(['FACTORY', 'ARTISAN']) type!: 'FACTORY' | 'ARTISAN';
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateJobWorkerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() specialty?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() notes?: string;
}
