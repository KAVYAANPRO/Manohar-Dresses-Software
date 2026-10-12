export interface CustomerRef {
  id: string;
  name: string;
  city: string;
}

// TODO: Replace with API call — GET /api/v1/customers
export const mockCustomerRefs: CustomerRef[] = [
  { id: 'cus-1', name: 'Fab India Retail', city: 'Bengaluru' },
  { id: 'cus-2', name: 'Myntra Wholesale', city: 'Bengaluru' },
  { id: 'cus-3', name: 'Lifestyle Stores', city: 'Mumbai' },
  { id: 'cus-4', name: 'Pantaloons', city: 'Mumbai' },
];
