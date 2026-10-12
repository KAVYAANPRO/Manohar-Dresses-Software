import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NumberSeries, NumberSeriesSchema } from './schemas/number-series.schema';
import { IdempotencyKeyRecord, IdempotencyKeySchema } from './schemas/idempotency-key.schema';
import { NumberSeriesService } from './services/number-series.service';
import { PartyScopeService } from './services/party-scope.service';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { PinoLoggerService } from './logging/pino-logger.service';
import { TransactionService } from './services/transaction.service';

/**
 * Cross-cutting infrastructure shared by every domain module (tech.md §1 "platform"
 * concerns): gapless numbering, idempotency, and party scoping. @Global() so domain modules
 * do not each have to re-import it.
 */
@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: NumberSeries.name, schema: NumberSeriesSchema },
      { name: IdempotencyKeyRecord.name, schema: IdempotencyKeySchema },
    ]),
  ],
  providers: [
    NumberSeriesService,
    PartyScopeService,
    IdempotencyInterceptor,
    PinoLoggerService,
    TransactionService,
  ],
  exports: [
    NumberSeriesService,
    PartyScopeService,
    IdempotencyInterceptor,
    PinoLoggerService,
    TransactionService,
    MongooseModule,
  ],
})
export class CommonModule {}
