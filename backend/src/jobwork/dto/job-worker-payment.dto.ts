import {
  IsDateString,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { JOB_WORKER_PAYMENT_KINDS, PAYMENT_MODES } from '../schemas/job-worker-payment.schema';

export class CreateJobWorkerPaymentDto {
  @IsMongoId() jobWorkerId!: string;
  @IsIn(JOB_WORKER_PAYMENT_KINDS) kind!: (typeof JOB_WORKER_PAYMENT_KINDS)[number];
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @IsIn(PAYMENT_MODES) mode?: (typeof PAYMENT_MODES)[number];
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsMongoId() jobSlipId?: string;
  /** Defaults to now; may be back-dated (cash handed over yesterday), never in the future. */
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class CancelJobWorkerPaymentDto {
  @IsString() @MinLength(1) reason!: string;
}
