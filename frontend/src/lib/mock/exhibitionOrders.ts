export interface ExhibitionOrderLine {
  design: string;
  qty: number;
  rate: number;
}

export interface ExhibitionOrder {
  id: string;
  orderNo: string;
  exhibitionName: string;
  location?: string;
  date: string;
  customerName: string;
  mobileNumber?: string;
  lines: ExhibitionOrderLine[];
  amountCollected: number;
  status: 'Pending' | 'Completed';
}

// TODO: Replace with API call — GET /api/v1/sales/exhibition-orders
export const mockExhibitionOrders: ExhibitionOrder[] = [
  {
    id: '1', orderNo: 'EX-26-001', exhibitionName: 'Surat Textile Expo', location: 'Surat', date: '15-09-2026',
    customerName: 'Walk-in — Priya Shah', mobileNumber: '9898000111',
    lines: [{ design: 'KU-5501 — Cotton Block Print Kurti', qty: 3, rate: 850 }],
    amountCollected: 2550,
    status: 'Completed',
  },
];
