import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus, MessageCircle } from 'lucide-react';
import { karigarsApi, type Karigar } from '../../../lib/api/karigars';
import { apiClient } from '../../../lib/api/client';
import { WhatsAppShareDialog } from '../../../components/feedback/WhatsAppShareDialog';

export function KarigarList() {
  const navigate = useNavigate();
  const [karigars, setKarigars] = useState<Karigar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [shareKarigar, setShareKarigar] = useState<Karigar | null>(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    karigarsApi.list()
      .then(setKarigars)
      .catch(() => setLoadError('Could not load karigars from the server.'))
      .finally(() => setIsLoading(false));
    apiClient.get<{ legalName?: string }>('/settings/company')
      .then(r => setCompanyName(r.data?.legalName ?? ''))
      .catch(() => setCompanyName(''));
  }, []);

  const filtered = karigars.filter(k =>
    k.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (k.firmName ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    k.mobileNumber.includes(searchTerm)
  );

  const columns = [
    { header: 'Full Name', accessor: 'fullName' as keyof Karigar },
    { header: 'Firm Name', accessor: (row: Karigar) => row.firmName || '—' },
    { header: 'Mobile Number', accessor: 'mobileNumber' as keyof Karigar },
    {
      header: 'Job Type',
      accessor: (row: Karigar) => (
        <span className="px-2 py-1 rounded-md text-xs font-medium bg-[#FFDCE5] text-[#8F002B] border border-[#FFB8CA]">
          {row.jobType}
        </span>
      ),
    },
    {
      header: 'GST',
      accessor: (row: Karigar) => (
        <div className="flex flex-col">
          <span className={`text-xs font-medium ${row.gstType === 'Registered' ? 'text-green-700' : 'text-slate-500'}`}>{row.gstType}</span>
          {row.gstNumber && <span className="text-xs text-slate-400 font-mono">{row.gstNumber}</span>}
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row: Karigar) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${row.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {row.status}
        </span>
      ),
    },
    {
      header: '',
      accessor: (row: Karigar) => (
        <button
          onClick={e => { e.stopPropagation(); setShareKarigar(row); }}
          className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium min-h-10 md:min-h-0"
        >
          <MessageCircle size={13} /> WhatsApp
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Karigars</h1>
          <p className="text-muted">Job workers who take up stitching, dyeing, cutting and other job-work batches.</p>
        </div>
        <Button onClick={() => navigate('/production/karigars/new')} className="w-full sm:w-auto shrink-0">
          <Plus size={16} /> Add Karigar
        </Button>
      </div>

      {loadError && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{loadError}</div>}

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by name, firm, or mobile..."
        onRowClick={(row: Karigar) => navigate(`/production/karigars/${row.id}`)}
      />

      <WhatsAppShareDialog
        open={!!shareKarigar}
        title="Message Karigar"
        defaultNumber={shareKarigar?.mobileNumber}
        message={shareKarigar
          ? `Hi ${shareKarigar.fullName},\n\nThis is ${companyName || 'us'}. Please let us know if you have any questions about your current job work.`
          : ''}
        onClose={() => setShareKarigar(null)}
      />
    </div>
  );
}
