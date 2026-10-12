import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SalesOrder, SalesOrderSchema } from './schemas/sales-order.schema';
import { Invoice, InvoiceSchema } from './schemas/invoice.schema';
import {
  InvoiceLineAllocation,
  InvoiceLineAllocationSchema,
} from './schemas/invoice-line-allocation.schema';
import { Payment, PaymentSchema } from './schemas/payment.schema';
import { PaymentAllocation, PaymentAllocationSchema } from './schemas/payment-allocation.schema';
import { CreditNote, CreditNoteSchema } from './schemas/credit-note.schema';
import { DeliveryChallan, DeliveryChallanSchema } from './schemas/delivery-challan.schema';
import { ExhibitionOrder, ExhibitionOrderSchema } from './schemas/exhibition-order.schema';
import { SalesReturn, SalesReturnSchema } from './schemas/sales-return.schema';
import { DeliveryChallansService } from './delivery-challans.service';
import { DeliveryChallansController } from './delivery-challans.controller';
import { SalesReturnsService } from './sales-returns.service';
import { SalesReturnsController, CreditNotesController } from './sales-returns.controller';
import { SalesLookupService } from './sales-lookup.service';
import { ExhibitionOrdersService } from './exhibition-orders.service';
import { ExhibitionOrdersController } from './exhibition-orders.controller';
import { SalesOrdersService } from './sales-orders.service';
import { SalesOrdersController } from './sales-orders.controller';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { TraceService } from './trace.service';
import { DesignHistoryService } from './design-history.service';
import { DesignHistoryController } from './design-history.controller';
import { MasterModule } from '../master/master.module';
import { DesignModule } from '../design/design.module';
import { InventoryModule } from '../inventory/inventory.module';
import { JobworkModule } from '../jobwork/jobwork.module';
import { PurchasingModule } from '../purchasing/purchasing.module';
import { CostingModule } from '../costing/costing.module';
import { ReadystockModule } from '../readystock/readystock.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SalesOrder.name, schema: SalesOrderSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: InvoiceLineAllocation.name, schema: InvoiceLineAllocationSchema },
      { name: Payment.name, schema: PaymentSchema },
      { name: PaymentAllocation.name, schema: PaymentAllocationSchema },
      { name: CreditNote.name, schema: CreditNoteSchema },
      { name: DeliveryChallan.name, schema: DeliveryChallanSchema },
      { name: ExhibitionOrder.name, schema: ExhibitionOrderSchema },
      { name: SalesReturn.name, schema: SalesReturnSchema },
    ]),
    MasterModule,
    DesignModule,
    InventoryModule,
    JobworkModule,
    PurchasingModule,
    CostingModule,
    ReadystockModule,
  ],
  controllers: [
    SalesOrdersController,
    InvoicesController,
    PaymentsController,
    DesignHistoryController,
    DeliveryChallansController,
    SalesReturnsController,
    CreditNotesController,
    ExhibitionOrdersController,
  ],
  providers: [
    SalesOrdersService,
    InvoicesService,
    PaymentsService,
    TraceService,
    DesignHistoryService,
    DeliveryChallansService,
    SalesReturnsService,
    SalesLookupService,
    ExhibitionOrdersService,
  ],
  exports: [SalesOrdersService, InvoicesService, PaymentsService, MongooseModule],
})
export class SalesModule {}
