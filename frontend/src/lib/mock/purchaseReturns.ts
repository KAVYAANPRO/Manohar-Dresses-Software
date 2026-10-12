export interface PurchaseReturnLine {
  material: string;
  qty: number;
  rate: number;
}

export interface PurchaseReturn {
  id: string;
  returnNo: string;
  date: string;
  supplier: string;
  poNo?: string;
  reason: string;
  lines: PurchaseReturnLine[];
  status: 'Pending' | 'Debited';
}

// TODO: Replace with API call — GET /api/v1/purchase-returns
export const mockPurchaseReturns: PurchaseReturn[] = [
  {
    id: '1', returnNo: 'PR-26-001', date: '26-09-2026', supplier: 'Alpha Fabrics', poNo: 'PO-24-001',
    reason: 'Colour mismatch on 50m fabric',
    lines: [{ material: 'Cotton Fabric - Blue', qty: 50, rate: 90 }],
    status: 'Debited',
  },
];
