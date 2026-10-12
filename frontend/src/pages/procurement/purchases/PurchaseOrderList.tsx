import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '../../../components/tables/DataTable';
import { Button } from '../../../components/ui/Button';
import { Plus } from 'lucide-react';
import { RestrictedValue } from '../../../lib/permissions/Can';
import { formatAmountWithExpenses } from '../../../lib/format/money';
import { suppliersApi } from '../../../lib/api/suppliers';
import {
  purchasesApi, problemMessage, formatDate,
  PURCHASE_STATUS_LABEL, PURCHASE_STATUS_CLASS, type PurchaseStatus,
} from '../../../lib/api/procurement';
import { FilterPills } from '../../pageKit';

interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  supplierName: string;
  invoiceNo: string;
  date: string;
  /** Materials amount only — see `otherCharges` for freight/transport etc. ("Expenses (if any)"). */
  totalAmount: number;
  otherCharges?: number;
  status: PurchaseStatus;
  isDirect?: boolean;
}

const FILTERS: Array<{ key: '' | PurchaseStatus; label: string }> = [
  { key: '', label: 'All' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'CONFIRMED', label: 'Confirmed' },
  { key: 'PARTIALLY_RECEIVED', label: 'Partial' },
  { key: 'RECEIVED', label: 'Received' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

export function PurchaseOrderList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [status, setStatus] = useState<'' | PurchaseStatus>('');

  useEffect(() => {
    let active = true;
    Promise.all([purchasesApi.list(), suppliersApi.list()])
      .then(([purchases, suppliers]) => {
        if (!active) return;
        const supName = new Map(suppliers.map(s => [s._id, s.name]));
        setOrders(purchases.map(p => ({
          id: p._id,
          poNumber: p.docNo,
          supplierName: supName.get(p.supplierId) ?? '—',
          invoiceNo: p.supplierInvoiceNo ?? '',
          date: formatDate(p.docDate),
          totalAmount: p.lines.reduce((s, l) => s + l.amount, 0),
          otherCharges: p.otherCharges,
          status: p.status,
          isDirect: p.isDirect,
        })));
      })
      .catch(err => active && setError(problemMessage(err, 'Could not load purchase orders.')))
      .finally(() => active && setIsLoading(false));
    return () => { active = false; };
  }, []);

  const q = searchTerm.toLowerCase();
  const filteredOrders = orders.filter(o =>
    (!status || o.status === status) &&
    (o.poNumber.toLowerCase().includes(q) || o.supplierName.toLowerCase().includes(q) || o.invoiceNo.toLowerCase().includes(q))
  );

  const columns = [
    {
      header: 'PO Number',
      accessor: (row: PurchaseOrderRow) => (
        <span className="font-mono font-semibold text-[#B80037]">
          {row.poNumber}
          {row.isDirect && <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-sans">Direct inward</span>}
        </span>
      ),
    },
    { header: 'Supplier', accessor: 'supplierName' as keyof PurchaseOrderRow },
    { header: 'Invoice No.', accessor: (row: PurchaseOrderRow) => row.invoiceNo || '—' },
    { header: 'Date', accessor: 'date' as keyof PurchaseOrderRow },
    {
      header: 'Total Amount',
      accessor: (row: PurchaseOrderRow) => (
        <RestrictedValue perm="purchases.rate.view">
          {formatAmountWithExpenses(row.totalAmount, row.otherCharges)}
        </RestrictedValue>
      )
    },
    {
      header: 'Status',
      accessor: (row: PurchaseOrderRow) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${PURCHASE_STATUS_CLASS[row.status]}`}>
          {PURCHASE_STATUS_LABEL[row.status]}
        </span>
      )
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Purchase Orders</h1>
          <p className="text-muted">Manage material procurement and purchase history.</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => navigate('/procurement/purchases/new')}>
          <Plus size={16} /> Create PO
        </Button>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

      <FilterPills options={FILTERS.map(f => f.key)} value={status} onChange={setStatus} label={k => FILTERS.find(f => f.key === k)?.label ?? k} />

      <DataTable
        columns={columns}
        data={filteredOrders}
        isLoading={isLoading}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search by PO number, supplier or invoice..."
        emptyMessage="No purchase orders yet."
        onRowClick={(row: PurchaseOrderRow) => navigate(`/procurement/purchases/${row.id}`)}
      />
    </div>
  );
}
