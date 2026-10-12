export interface Agent {
  id: string;
  name: string;
  agencyName?: string;
  mobileNumber: string;
  commissionPct?: number;
  status: 'Active' | 'Inactive';
}

// TODO: Replace with API call — GET /api/v1/masters/agents
export const mockAgents: Agent[] = [
  { id: 'agt-1', name: 'Vikram Traders', agencyName: 'Vikram Sales Agency', mobileNumber: '9898100001', commissionPct: 2, status: 'Active' },
  { id: 'agt-2', name: 'Suresh Kumar', agencyName: '', mobileNumber: '9898100002', commissionPct: 1.5, status: 'Active' },
  { id: 'agt-3', name: 'Meena Distributors', agencyName: 'Meena & Co.', mobileNumber: '9898100003', status: 'Inactive' },
];
