export interface ReturnLine {
  design: string;
  qty: number;
  rate: number;
}

export interface SalesReturn {
  id: string;
  returnNo: string;
  date: string;
  customer: string;
  invoiceNo?: string;
  reason: string;
  lines: ReturnLine[];
  status: 'Pending' | 'Credited';
}

// TODO: Replace with API call — GET /api/v1/sales-returns
export const mockSalesReturns: SalesReturn[] = [
  {
    id: '1', returnNo: 'SR-26-001', date: '27-09-2026', customer: 'Fab India Retail', invoiceNo: 'INV-26-010',
    reason: 'Size mismatch on 10 pieces',
    lines: [{ design: 'DR-1024 — Summer Floral Dress', qty: 10, rate: 1140 }],
    status: 'Credited',
  },
];
