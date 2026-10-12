import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { agentsApi, apiErrorMessage, type AgentRecord as AgentApiRecord } from '../../../lib/api/sales';

type AgentRecord = AgentApiRecord & { id: string };

export function AgentList() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    agentsApi.list()
      .then(rows => setAgents(rows.map(a => ({ ...a, id: a._id }))))
      .catch(e => setError(apiErrorMessage(e, 'Could not load agents.')))
      .finally(() => setIsLoading(false));
  }, []);

  const q = searchTerm.toLowerCase();
  const filtered = agents.filter(a => a.name.toLowerCase().includes(q) || (a.agencyName ?? '').toLowerCase().includes(q) || a.mobile.includes(q));

  const columns = [
    { header: 'Agent Name', accessor: 'name' as keyof AgentRecord },
    { header: 'Agency Name', accessor: (row: AgentRecord) => row.agencyName || '—' },
    { header: 'Mobile Number', accessor: 'mobile' as keyof AgentRecord },
    { header: 'Commission %', accessor: (row: AgentRecord) => (row.commissionPct ? `${row.commissionPct}%` : '—') },
    { header: 'Customers', accessor: (row: AgentRecord) => String(row.customerCount ?? 0) },
    {
      header: 'Status',
      accessor: (row: AgentRecord) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${row.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Agents</h1>
          <p className="text-muted">Sales agents linked to customers; commission is calculated on invoice taxable value.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/masters/agents/new')}>
          <Plus size={16} /> Add Agent
        </Button>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">{error}</div>}

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by agent, agency or mobile..."
        onRowClick={(row: AgentRecord) => navigate(`/masters/agents/${row._id}`)}
      />
    </div>
  );
}
