import type { ReactNode } from 'react';
import { Search, Inbox, X } from 'lucide-react';
import { Skeleton } from '../ui/Skeleton';
import { staggerDelay } from '../ui/motionTokens';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  className?: string;
  /** Leave this column out of the phone card view (e.g. a column that only repeats the card title). */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

function renderCell<T>(col: Column<T>, row: T): ReactNode {
  return typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as ReactNode);
}

export function DataTable<T extends { id: string | number }>({
  columns,
  data,
  onRowClick,
  searchPlaceholder = 'Search...',
  searchValue = '',
  onSearchChange,
  isLoading = false,
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  return (
    <div className="flex flex-col gap-4">
      {onSearchChange && (
        <div className="relative w-full md:max-w-sm">
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            className="peer w-full pl-9 pr-9 py-2.5 md:py-2 text-base md:text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder:text-slate-400 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-[#E40043]/15 focus:border-[#E40043]"
          />
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-colors peer-focus:text-[#E40043]" />
          {searchValue && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 animate-pop"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}

      {/* Phone: one card per row — first column is the card title, the rest are label/value pairs. */}
      <div className="md:hidden flex flex-col gap-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <div key={`msk-${idx}`} className="bg-white border border-slate-200/80 rounded-xl p-4 flex flex-col gap-2.5 shadow-card">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          : data.length === 0
          ? (
              <div className="bg-white border border-dashed border-slate-200 rounded-xl px-4 py-10 flex flex-col items-center gap-2 text-center text-slate-400 text-sm animate-fade-in">
                <span className="w-11 h-11 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center"><Inbox size={20} /></span>
                {emptyMessage}
              </div>
            )
          : data.map((row, idx) => {
              const [first, ...rest] = columns.filter(c => !c.hideOnMobile);
              return (
                <div
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  style={{ animationDelay: `${staggerDelay(idx)}s` }}
                  className={`bg-white border border-slate-200/80 rounded-xl p-4 shadow-card flex flex-col gap-2 animate-fade-up ${
                    onRowClick ? 'pressable active:bg-slate-50 cursor-pointer' : ''
                  }`}
                >
                  {first && (
                    <div className="font-semibold text-slate-900 break-words">{renderCell(first, row)}</div>
                  )}
                  {rest.map((col, ci) => (
                    <div key={ci} className="flex items-start justify-between gap-3 text-sm">
                      <span className="text-slate-500 shrink-0">{col.header}</span>
                      <span className="text-slate-700 text-right min-w-0 break-words">{renderCell(col, row)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
      </div>

      <div className="hidden md:block bg-white border border-slate-200/80 rounded-xl overflow-x-auto shadow-card">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={`sk-${idx}`} className="border-b border-slate-100">
                    {columns.map((_, ci) => (
                      <td key={ci} className="px-4 py-3">
                        <Skeleton className="h-4 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : data.length === 0
              ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-400 text-sm">
                      <div className="flex flex-col items-center gap-2 animate-fade-in">
                        <span className="w-11 h-11 rounded-full bg-slate-50 text-slate-300 flex items-center justify-center"><Inbox size={20} /></span>
                        {emptyMessage}
                      </div>
                    </td>
                  </tr>
                )
              : data.map((row, idx) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row)}
                    style={{ animationDelay: `${staggerDelay(idx, 0.02)}s` }}
                    className={`border-b border-slate-100 last:border-0 transition-colors animate-fade-in ${
                      onRowClick ? 'hover:bg-[#FFF6F8] cursor-pointer' : ''
                    }`}
                  >
                    {columns.map((col, ci) => (
                      <td key={ci} className={`px-4 py-3 text-sm text-slate-700 ${col.className ?? ''}`}>
                        {renderCell(col, row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
