import { apiClient } from './client';
export { apiErrorMessage, fmtDate } from './insights';

/* ------------------------------------------------------------------ shared */

export const inr = (n?: number | null) =>
  '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface VariantLabel {
  designVariantId: string;
  designId?: string;
  designNo?: string;
  designName?: string;
  categoryName?: string;
  colourName?: string;
  sizeName?: string;
  hsn?: string;
}

export const variantText = (l: VariantLabel) =>
  `${l.designNo ?? '?'} / ${l.colourName ?? '?'} / ${l.sizeName ?? '?'}`;

/** Sellable item from GET /ready-stock/items (all variants with stock figures). */
export interface SellableItem extends VariantLabel {
  stockItemId?: string;
  colourId: string;
  sizeId: string;
  defaultSellingRate?: number;
  onHand: number;
  reserved: number;
  atp: number;
  packedQty: number;
}

export interface CustomerRef {
  _id: string;
  name: string;
  businessName?: string;
  state?: string;
  gstin?: string;
  mobile?: string;
  billingAddress?: string;
  defaultDiscountPct?: number;
  agentId?: string | null;
  isActive: boolean;
}

export const customerLabel = (c?: { name?: string; businessName?: string }) => c?.businessName || c?.name || '';

/* ------------------------------------------------------------------ ready stock & packing */

export interface ReadyStockGroup {
  designId: string;
  designNo: string;
  designName: string;
  categoryId: string;
  colourId: string;
  colourName: string;
  sizes: { sizeId: string; sizeName: string; stockItemId: string; onHand: number; reserved: number; atp: number }[];
  totalQty: number;
  totalReserved: number;
  totalValue?: number;
  lastReceivedOn?: string;
  factories: string[];
  locations: string[];
}

export interface ReadyStockLot {
  stockItemId: string;
  designNo: string;
  colourName: string;
  sizeName: string;
  lotNo: string;
  qty: number;
  locationCode: string;
  receivedOn: string;
  jobWorkerName?: string;
  unitCost?: number;
}

export interface PackingRow {
  stockItemId: string;
  designNo: string;
  designName: string;
  categoryId: string;
  colourName: string;
  sizeId: string;
  sizeName: string;
  onHand: number;
  packedQty: number;
  pendingQty: number;
  packingStatus: 'UNPACKED' | 'PARTIALLY_PACKED' | 'FULLY_PACKED';
}

export const readyStockApi = {
  summary: () => apiClient.get<ReadyStockGroup[]>('/ready-stock/summary').then(r => r.data),
  lots: (params?: { designId?: string; colourId?: string }) =>
    apiClient.get<ReadyStockLot[]>('/ready-stock/lots', { params }).then(r => r.data),
  items: (params?: { designId?: string; inStockOnly?: boolean }) =>
    apiClient.get<SellableItem[]>('/ready-stock/items', { params }).then(r => r.data),
  packing: () => apiClient.get<PackingRow[]>('/packing/dashboard').then(r => r.data),
  pack: (stockItemId: string, qty: number) => apiClient.post(`/packing/${stockItemId}/pack`, { qty }).then(r => r.data),
  unpack: (stockItemId: string, qty: number) => apiClient.post(`/packing/${stockItemId}/unpack`, { qty }).then(r => r.data),
  categories: () => apiClient.get<{ _id: string; name: string }[]>('/product-categories').then(r => r.data),
};

/* ------------------------------------------------------------------ pricing preview */

export interface PricedLine {
  designVariantId: string;
  qty: number;
  unitRate: number;
  discountPct: number;
  extraDiscountPct?: number;
  grossAmount: number;
  discountAmount: number;
  taxableValue: number;
  taxRatePct: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  hsn: string;
}

export interface PricePreview {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  otherCharges: number;
  roundOff: number;
  grandTotal: number;
  isIntraState: boolean;
  placeOfSupply?: string;
}

export interface LineInput {
  designVariantId: string;
  qty: number;
  unitRate?: number;
  discountPct?: number;
  extraDiscountPct?: number;
  salesOrderLineId?: string;
}

export const pricingApi = {
  preview: (body: { customerId: string; lines: LineInput[]; otherCharges?: number }) =>
    apiClient.post<PricePreview>('/invoices/preview', body).then(r => r.data),
};

/* ------------------------------------------------------------------ sales orders */

export type SOStatus = 'DRAFT' | 'CONFIRMED' | 'PARTIALLY_INVOICED' | 'INVOICED' | 'CANCELLED';
export const soStatusLabel: Record<SOStatus, string> = {
  DRAFT: 'Draft', CONFIRMED: 'Confirmed', PARTIALLY_INVOICED: 'Partially Invoiced', INVOICED: 'Invoiced', CANCELLED: 'Cancelled',
};

export interface SalesOrderRow {
  _id: string;
  docNo: string;
  docDate: string;
  customerId: string;
  customerName?: string;
  status: SOStatus;
  itemCount: number;
  totalQty: number;
  invoicedQty: number;
  taxableTotal: number;
  shippingCharge?: number;
  otherCharges?: number;
}

export interface SalesOrderLineView {
  _id: string;
  designVariantId: string;
  stockItemId: string;
  qty: number;
  qtyInvoiced: number;
  pendingQty: number;
  unitRate: number;
  discountPct: number;
  extraDiscountPct?: number;
  onHand: number;
  atp: number;
}

export interface SalesOrderView {
  _id: string;
  docNo: string;
  docDate: string;
  status: SOStatus;
  customerId: string;
  customer?: { _id: string; name: string; gstin?: string; state?: string; defaultDiscountPct?: number };
  agent?: { _id: string; name: string; commissionPct?: number };
  customerRefNo?: string;
  transportName?: string;
  expectedDate?: string;
  shippingCharge: number;
  otherCharges: number;
  notes?: string;
  cancelReason?: string;
  lines: SalesOrderLineView[];
  invoices: { _id: string; docNo: string; docDate: string; grandTotal: number; status: string; paymentStatus: string }[];
}

export const salesOrdersApi = {
  list: () => apiClient.get<SalesOrderRow[]>('/sales-orders').then(r => r.data),
  get: (id: string) => apiClient.get<SalesOrderView>(`/sales-orders/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => apiClient.post<SalesOrderView>('/sales-orders', body).then(r => r.data),
  confirm: (id: string) => apiClient.post(`/sales-orders/${id}/confirm`).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/sales-orders/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ invoices */

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export const payStatusLabel: Record<PaymentStatus, string> = { UNPAID: 'Unpaid', PARTIAL: 'Partially Paid', PAID: 'Paid' };

export interface InvoiceRow {
  _id: string;
  docNo: string;
  docDate: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  paymentStatus: PaymentStatus;
  customerId: string;
  customerName: string;
  customerGstinSnapshot?: string;
  salesOrderNo?: string;
  grandTotal: number;
  otherCharges: number;
  paidAmount: number;
  creditedAmount: number;
  outstanding: number;
  totalQty: number;
}

export interface InvoiceLineView extends VariantLabel {
  _id: string;
  qty: number;
  unitRate: number;
  discountPct: number;
  discountAmount: number;
  grossAmount: number;
  taxableValue: number;
  taxRatePct: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  returnedQty: number;
  returnableQty: number;
}

export interface InvoiceView extends InvoiceRow {
  customerAddress?: string;
  customerGstin?: string;
  placeOfSupply?: string;
  isIntraState: boolean;
  company?: { legalName: string; gstin?: string; state: string };
  lines: InvoiceLineView[];
  subtotal: number;
  discountTotal: number;
  taxableTotal: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  roundOff: number;
  notes?: string;
  cancelReason?: string;
  agentNameSnapshot?: string;
  commissionPct?: number;
  commissionAmount?: number;
  deliveryChallanNo?: string;
  excessCredit: number;
  payments: { paymentId: string; docNo?: string; date: string; mode: string; reference?: string; amount: number }[];
  creditNotes: { _id: string; docNo: string; docDate: string; total: number; reason: string }[];
}

export const invoicesApi = {
  list: (params?: Record<string, string>) => apiClient.get<InvoiceRow[]>('/invoices', { params }).then(r => r.data),
  get: (id: string) => apiClient.get<InvoiceView>(`/invoices/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => apiClient.post<InvoiceView>('/invoices', body).then(r => r.data),
  confirm: (id: string) => apiClient.post(`/invoices/${id}/confirm`).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/invoices/${id}/cancel`, { reason }).then(r => r.data),
  pending: (customerId?: string) =>
    apiClient
      .get<{ invoiceId: string; docNo: string; docDate: string; customerId: string; customerName: string; grandTotal: number; allocated: number; credited: number; outstanding: number; paymentStatus: PaymentStatus }[]>(
        '/payments/pending-invoices',
        { params: customerId ? { customerId } : undefined },
      )
      .then(r => r.data),
};

/* ------------------------------------------------------------------ payments */

export const PAYMENT_MODES = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CARD', label: 'Card' },
  { value: 'OTHER', label: 'Other' },
] as const;
export const modeLabel = (m?: string) => PAYMENT_MODES.find(x => x.value === m)?.label ?? m ?? '';

export interface PaymentRow {
  _id: string;
  docNo?: string;
  date: string;
  customerId: string;
  customerName?: string;
  amount: number;
  amountAllocated: number;
  unallocated: number;
  mode: string;
  reference?: string;
  notes?: string;
  allocations: { invoiceId: string; invoiceNo?: string; amount: number }[];
}

export const paymentsApi = {
  list: () => apiClient.get<PaymentRow[]>('/payments').then(r => r.data),
  record: (body: Record<string, unknown>) => apiClient.post('/payments', body).then(r => r.data),
  allocate: (paymentId: string, invoiceId: string, amount: number) =>
    apiClient.post(`/payments/${paymentId}/allocations`, { invoiceId, amount }).then(r => r.data),
};

/* ------------------------------------------------------------------ sales returns */

export interface SalesReturnRow {
  _id: string;
  docNo: string;
  docDate: string;
  invoiceId: string;
  invoiceNo?: string;
  customerId: string;
  customerName?: string;
  reason: string;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
  taxableTotal: number;
  taxTotal: number;
  roundOff: number;
  creditTotal: number;
  creditNoteNo?: string;
  totalQty: number;
  lines: (VariantLabel & { _id: string; invoiceLineId: string; qty: number; condition: 'GOOD' | 'DAMAGED'; unitRate: number; taxableValue: number; cgst: number; sgst: number; igst: number; lineTotal: number })[];
}

export const salesReturnsApi = {
  list: () => apiClient.get<SalesReturnRow[]>('/sales-returns').then(r => r.data),
  get: (id: string) => apiClient.get<SalesReturnRow>(`/sales-returns/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => apiClient.post<SalesReturnRow>('/sales-returns', body).then(r => r.data),
  confirm: (id: string) => apiClient.post(`/sales-returns/${id}/confirm`).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/sales-returns/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ delivery challans */

export type ChallanStatus = 'DRAFT' | 'DISPATCHED' | 'PARTIALLY_CLOSED' | 'CLOSED' | 'CANCELLED';
export const challanStatusLabel: Record<ChallanStatus, string> = {
  DRAFT: 'Draft', DISPATCHED: 'With Customer', PARTIALLY_CLOSED: 'Partially Closed', CLOSED: 'Closed', CANCELLED: 'Cancelled',
};

export interface ChallanRow {
  _id: string;
  docNo: string;
  docDate: string;
  customerId: string;
  customerName?: string;
  salesOrderNo?: string;
  purpose: string;
  transportName?: string;
  vehicleNumber?: string;
  notes?: string;
  status: ChallanStatus;
  totalQty: number;
  openQty: number;
  lines: (VariantLabel & { _id: string; qty: number; qtyInvoiced: number; qtyReturned: number; openQty: number; unitRate?: number })[];
  invoices?: { _id: string; docNo: string; status: string; grandTotal: number }[];
}

export const challansApi = {
  list: () => apiClient.get<ChallanRow[]>('/delivery-challans').then(r => r.data),
  get: (id: string) => apiClient.get<ChallanRow>(`/delivery-challans/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => apiClient.post<ChallanRow>('/delivery-challans', body).then(r => r.data),
  dispatch: (id: string) => apiClient.post(`/delivery-challans/${id}/dispatch`).then(r => r.data),
  returnGoods: (id: string, lines: { lineId: string; qty: number; condition: 'GOOD' | 'DAMAGED' }[], note?: string) =>
    apiClient.post(`/delivery-challans/${id}/return`, { lines, note }).then(r => r.data),
  invoice: (id: string, body: { lines?: { lineId: string; qty: number }[]; confirm?: boolean }) =>
    apiClient.post<{ _id: string; docNo: string }>(`/delivery-challans/${id}/invoice`, body).then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/delivery-challans/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ exhibition orders */

export interface ExhibitionRow {
  _id: string;
  docNo: string;
  docDate: string;
  exhibitionName: string;
  location?: string;
  customerName: string;
  mobile?: string;
  state?: string;
  customerId?: string;
  amountCollected: number;
  paymentMode?: string;
  notes?: string;
  status: 'PENDING' | 'CONVERTED' | 'CANCELLED';
  totalQty: number;
  totalAmount: number;
  balance: number;
  salesOrderId?: string;
  salesOrderNo?: string;
  invoiceId?: string;
  invoiceNo?: string;
  lines: (VariantLabel & { _id: string; qty: number; unitRate: number; discountPct: number })[];
}

export const exhibitionsApi = {
  list: () => apiClient.get<ExhibitionRow[]>('/exhibition-orders').then(r => r.data),
  get: (id: string) => apiClient.get<ExhibitionRow>(`/exhibition-orders/${id}`).then(r => r.data),
  create: (body: Record<string, unknown>) => apiClient.post<ExhibitionRow>('/exhibition-orders', body).then(r => r.data),
  convert: (id: string, target: 'SALES_ORDER' | 'INVOICE', customerId?: string) =>
    apiClient
      .post<{ salesOrder?: { _id: string; docNo: string }; invoice?: { _id: string; docNo: string }; confirmError?: string }>(
        `/exhibition-orders/${id}/convert`,
        { target, customerId: customerId || undefined },
      )
      .then(r => r.data),
  cancel: (id: string, reason: string) => apiClient.post(`/exhibition-orders/${id}/cancel`, { reason }).then(r => r.data),
};

/* ------------------------------------------------------------------ agents */

export interface AgentRecord {
  _id: string;
  name: string;
  agencyName?: string;
  mobile: string;
  email?: string;
  city?: string;
  commissionPct?: number;
  notes?: string;
  isActive: boolean;
  customerCount?: number;
}

export const agentsApi = {
  list: () => apiClient.get<AgentRecord[]>('/agents').then(r => r.data),
  get: (id: string) => apiClient.get<AgentRecord>(`/agents/${id}`).then(r => r.data),
  summary: (id: string) =>
    apiClient
      .get<{ agent: AgentRecord; customers: CustomerRef[]; invoices: { _id: string; docNo: string; docDate: string; customerNameSnapshot: string; taxableTotal: number; commissionAmount: number }[]; totalSales: number; totalCommission: number }>(
        `/agents/${id}/summary`,
      )
      .then(r => r.data),
  create: (body: Partial<AgentRecord>) => apiClient.post<AgentRecord>('/agents', body).then(r => r.data),
  update: (id: string, body: Partial<AgentRecord>) => apiClient.patch<AgentRecord>(`/agents/${id}`, body).then(r => r.data),
  setActive: (id: string, active: boolean) => apiClient.post(`/agents/${id}/${active ? 'reactivate' : 'deactivate'}`).then(r => r.data),
};

export const customersRefApi = {
  list: () => apiClient.get<CustomerRef[]>('/customers').then(r => r.data),
};

export const companyApi = {
  get: () =>
    apiClient
      .get<{ legalName: string; gstin?: string; state: string; ownerWhatsapp?: string }>('/settings/company')
      .then(r => r.data),
};
