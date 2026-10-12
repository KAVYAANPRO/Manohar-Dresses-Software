/** DOC-01/JOB-05: print-ready HTML (R1) - no PDF generation, the browser's own print dialog does that (R2 is a server-rendered PDF, DOC-02). */
export interface PrintDocument {
  title: string;
  docNo: string;
  docDate: Date | string;
  companyName: string;
  companyAddress?: string;
  companyGstin?: string;
  parties: Array<{ label: string; name: string; address?: string; gstin?: string }>;
  meta?: Array<{ label: string; value: string }>;
  columns: string[];
  rows: Array<Array<string | number>>;
  totals?: Array<{ label: string; value: string; emphasis?: boolean }>;
  notes?: string;
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function formatDate(d: Date | string): string {
  const date = new Date(d);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function renderPrintDocument(doc: PrintDocument): string {
  const partyBlocks = doc.parties
    .map(
      (p) => `
        <div class="party">
          <div class="party-label">${esc(p.label)}</div>
          <div class="party-name">${esc(p.name)}</div>
          ${p.address ? `<div>${esc(p.address)}</div>` : ''}
          ${p.gstin ? `<div>GSTIN: ${esc(p.gstin)}</div>` : ''}
        </div>`,
    )
    .join('\n');

  const metaBlock = (doc.meta ?? [])
    .map((m) => `<div><span class="meta-label">${esc(m.label)}:</span> ${esc(m.value)}</div>`)
    .join('\n');

  const headerCells = doc.columns.map((c) => `<th>${esc(c)}</th>`).join('');
  const bodyRows = doc.rows
    .map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`)
    .join('\n');

  const totalsBlock = (doc.totals ?? [])
    .map(
      (t) =>
        `<div class="total-row${t.emphasis ? ' total-emphasis' : ''}"><span>${esc(t.label)}</span><span>${esc(t.value)}</span></div>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8" />
<title>${esc(doc.title)} ${esc(doc.docNo)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1a1a1a; margin: 0; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 12px; }
  .company-name { font-size: 18px; font-weight: bold; }
  .doc-title { font-size: 16px; font-weight: bold; text-align: right; }
  .doc-no { text-align: right; font-size: 13px; }
  .parties { display: flex; gap: 24px; margin-bottom: 12px; }
  .party { flex: 1; border: 1px solid #ccc; padding: 8px; }
  .party-label { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: 0.5px; }
  .party-name { font-weight: bold; margin: 2px 0; }
  .meta { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 12px; font-size: 11px; }
  .meta-label { color: #666; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 11px; }
  th { background: #f2f2f2; }
  td:last-child, th:last-child { text-align: right; }
  .totals { width: 300px; margin-left: auto; }
  .total-row { display: flex; justify-content: space-between; padding: 3px 0; }
  .total-emphasis { font-weight: bold; font-size: 13px; border-top: 1px solid #1a1a1a; margin-top: 4px; padding-top: 6px; }
  .notes { margin-top: 16px; font-size: 11px; color: #444; white-space: pre-wrap; }
  .print-bar { text-align: right; margin-bottom: 12px; }
  .print-bar button { padding: 6px 14px; font-size: 12px; cursor: pointer; }
  @media print { .print-bar { display: none; } }
</style>
</head>
<body>
  <div class="print-bar"><button onclick="window.print()">Print</button></div>
  <div class="header">
    <div>
      <div class="company-name">${esc(doc.companyName)}</div>
      ${doc.companyAddress ? `<div>${esc(doc.companyAddress)}</div>` : ''}
      ${doc.companyGstin ? `<div>GSTIN: ${esc(doc.companyGstin)}</div>` : ''}
    </div>
    <div>
      <div class="doc-title">${esc(doc.title)}</div>
      <div class="doc-no">${esc(doc.docNo)}</div>
      <div class="doc-no">${formatDate(doc.docDate)}</div>
    </div>
  </div>
  <div class="parties">${partyBlocks}</div>
  ${metaBlock ? `<div class="meta">${metaBlock}</div>` : ''}
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
  ${totalsBlock ? `<div class="totals">${totalsBlock}</div>` : ''}
  ${doc.notes ? `<div class="notes">${esc(doc.notes)}</div>` : ''}
</body>
</html>`;
}
