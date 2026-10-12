export interface ChallanLine {
  design: string;
  qty: number;
}

export interface DeliveryChallan {
  id: string;
  challanNo: string;
  date: string;
  customer: string;
  soNo?: string;
  transportName?: string;
  vehicleNumber?: string;
  lines: ChallanLine[];
  status: 'Pending' | 'Delivered';
  notes?: string;
}

// TODO: Replace with API call — GET /api/v1/delivery-challans
export const mockChallans: DeliveryChallan[] = [
  {
    id: '1', challanNo: 'DC-26-001', date: '24-09-2026', customer: 'Myntra Wholesale', soNo: 'SO-26-002',
    transportName: 'Shree Cargo', vehicleNumber: 'GJ-01-AB-1234',
    lines: [{ design: 'DR-1024 — Summer Floral Dress', qty: 80 }],
    status: 'Delivered',
  },
  {
    id: '2', challanNo: 'DC-26-002', date: '26-09-2026', customer: 'Lifestyle Stores', soNo: 'SO-26-003',
    transportName: 'VRL Logistics',
    lines: [{ design: 'KU-5501 — Cotton Block Print Kurti', qty: 150 }],
    status: 'Pending',
  },
];
