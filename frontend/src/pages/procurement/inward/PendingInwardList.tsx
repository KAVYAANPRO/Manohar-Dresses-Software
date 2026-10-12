import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus, RotateCcw } from 'lucide-react';
import { Can } from '../../../lib/permissions/Can';
import { suppliersApi } from '../../../lib/api/suppliers';
import { purchasesApi, inwardsApi, problemMessage, formatDate, type Inward } from '../../../lib/api/procurement';
import { TabUnderline } from '../../pageKit';

interface PendingInward {
  id: string; // PO ID
  poNumber: string;
  supplierName: string;
  poDate: string;
  expectedDate: string;
  pendingItems: number;
  status: string;
}

const INWARD_STATUS_CLASS: Record<Inward['status'], string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  CONFIRMED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
};

export function PendingInwardList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'pending' | 'recent'>('pending');
  const [pending, setPending] = useState<PendingInward[]>([]);
  const [inwards, setInwards] = useState<Inward[]>([]);
  const [supNames, setSupNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([purchasesApi.pendingInward(), inwardsApi.list(), suppliersApi.list()])
      .then(([pos, inw, sups]) => {
        if (!active) return;
        const names = new Map(sups.map(s => [s._id, s.name]));
        setSupNames(names);
        setPending(pos.map(p => ({
          id: p._id,
          poNumber: p.docNo,
          supplierName: names.get(p.supplierId) ?? '—',
          poDate: formatDate(p.docDate),
          expectedDate: formatDate(p.expectedDeliveryDate),
          pendingItems: p.lines.filter(l => l.qtyReceivedBase < l.qtyBase - 0.0005).length,
          status: p.status === 'PARTIALLY_RECEIVED' ? 'Partially received' : 'Not received',
        })));
        setInwards(inw);
      })
      .catch(err => active && setError(problemMessage(err, 'Could not load pending inwards.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const q = searchTerm.toLowerCase();
  const filteredPending = pending.filter(i =>
    i.poNumber.toLowerCase().includes(q) || i.supplierName.toLowerCase().includes(q)
  );
  const recentRows = useMemo(() => inwards
    .map(i => ({
      id: i._id,
      inward: i,
      docNo: i.docNo,
      supplierName: supNames.get(i.supplierId) ?? '—',
      date: formatDate(i.docDate),
      lines: i.lines.length,
    }))
    .filter(r => r.docNo.toLowerCase().includes(q) || r.supplierName.toLowerCase().includes(q) || (r.inward.supplierRef ?? '').toLowerCase().includes(q)),
  [inwards, supNames, q]);

  const pendingColumns = [
    { header: 'PO Number', accessor: (row: PendingInward) => <span className="font-mono font-semibold text-[#B80037]">{row.poNumber}</span> },
    { header: 'Supplier', accessor: 'supplierName' as keyof PendingInward },
    { header: 'PO Date', accessor: 'poDate' as keyof PendingInward },
    { header: 'Expected Delivery', accessor: 'expectedDate' as keyof PendingInward },
    {
      header: 'Pending Items',
      accessor: (row: PendingInward) => (
        <span className="bg-yellow-100 text-yellow-800 font-medium px-2 py-1 rounded-full text-xs">
          {row.pendingItems} item{row.pendingItems === 1 ? '' : 's'} · {row.status}
        </span>
      )
    },
  ];

  type RecentRow = (typeof recentRows)[number];
  const recentColumns = [
    { header: 'Inward No.', accessor: (row: RecentRow) => <span className="font-mono font-semibold text-[#B80037]">{row.docNo}</span> },
    { header: 'Supplier', accessor: 'supplierName' as keyof RecentRow },
    { header: 'Date', accessor: 'date' as keyof RecentRow },
    { header: 'Ref / Challan', accessor: (row: RecentRow) => row.inward.supplierRef || '—' },
    { header: 'Lines', accessor: (row: RecentRow) => `${row.lines}${row.inward.isDirect ? ' · direct' : ''}` },
    {
      header: 'Status',
      accessor: (row: RecentRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${INWARD_STATUS_CLASS[row.inward.status]}`}>{row.inward.status}</span>
      ),
    },
    {
      header: '',
      hideOnMobile: false,
      accessor: (row: RecentRow) => row.inward.status === 'CONFIRMED' ? (
        <Can perm="purchases.create">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/procurement/returns/new?inwardId=${row.id}`); }}
            className="inline-flex items-center gap-1 min-h-9 text-sm text-[#E40043] font-medium"
          >
            <RotateCcw size={14} /> Return
          </button>
        </Can>
      ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Purchase Inward</h1>
          <p className="text-muted">Receive raw materials — directly or against pending Purchase Orders.</p>
        </div>
        <Can perm="inward.create">
          <Button className="w-full sm:w-auto" onClick={() => navigate('/procurement/inward/new')}>
            <Plus size={16} /> New Purchase Inward
          </Button>
        </Can>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <div className="flex gap-1 border-b border-slate-200 overflow-x-auto">
        {([['pending', `Pending POs (${pending.length})`], ['recent', `Inwards (${inwards.length})`]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2.5 min-h-[44px] text-sm font-medium border-b-2 border-transparent -mb-px whitespace-nowrap shrink-0 transition-colors ${tab === key ? 'text-[#E40043]' : 'text-slate-500'}`}
          >
            {tab === key && <TabUnderline group="inward" />}
            {label}
          </button>
        ))}
      </div>

      {tab === 'pending' ? (
        <DataTable
          columns={pendingColumns}
          data={filteredPending}
          isLoading={isLoading}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search by PO number or supplier..."
          emptyMessage="No confirmed purchase orders are waiting for material."
          onRowClick={(row: PendingInward) => navigate(`/procurement/inward/${row.id}`)}
        />
      ) : (
        <DataTable
          columns={recentColumns}
          data={recentRows}
          isLoading={isLoading}
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Search by inward no., supplier or challan..."
          emptyMessage="No inwards recorded yet."
          onRowClick={(row: RecentRow) => navigate(`/inventory/ledger?docId=${row.id}`)}
        />
      )}
    </div>
  );
}
