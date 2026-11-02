export interface TabularReport {
  columns: string[];
  rows: string[][];
  title: string;
}

const escapeCsv = (value: string): string => `"${value.replace(/"/gu, '""')}"`;
const escapeHtml = (value: string): string => value.replace(/[&<>"']/gu, (character: string): string => {
  const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return entities[character] || character;
});

export const toReportCsv = (report: TabularReport): string =>
  [report.columns, ...report.rows].map((row: string[]): string => row.map(escapeCsv).join(',')).join('\r\n') + '\r\n';

export const toReportPrintHtml = (report: TabularReport): string => {
  const header: string = report.columns.map((column: string): string => `<th>${escapeHtml(column)}</th>`).join('');
  const rows: string = report.rows.map((row: string[]): string =>
    `<tr>${row.map((value: string): string => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>` +
    '<style>body{font:12px sans-serif;margin:20px}table{border-collapse:collapse;width:100%}' +
    'th,td{border:1px solid #aaa;padding:5px;text-align:left;vertical-align:top;overflow-wrap:anywhere}' +
    'thead{display:table-header-group}@media print{body{margin:0}}</style></head><body>' +
    `<h1>${escapeHtml(report.title)}</h1><table><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
};

export const createReportPdf = (report: TabularReport): Promise<Blob> =>
  Promise.all([import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js')])
    .then(([pdfMakeModule, fontModule]): Promise<Blob> => {
      const pdfMake = pdfMakeModule.default || pdfMakeModule;
      const fontFiles = fontModule.default || fontModule;
      pdfMake.addVirtualFileSystem(fontFiles);
      return pdfMake.createPdf({
        content: [
          { fontSize: 18, margin: [0, 0, 0, 12], text: report.title },
          ...report.rows.map((row: string[]): { margin: [number, number, number, number]; stack: Array<{ text: string }> } => ({
            margin: [0, 0, 0, 12],
            stack: report.columns.map((column: string, index: number): { text: string } => ({
              text: `${column}: ${row[index] || ''}`,
            })),
          })),
        ],
        defaultStyle: { fontSize: 10 },
        pageMargins: [36, 36, 36, 36],
      }).getBlob();
    });

export const downloadReportBlob = (blob: Blob, fileName: string): void => {
  const url: string = URL.createObjectURL(blob);
  const anchor: HTMLAnchorElement = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout((): void => URL.revokeObjectURL(url), 0);
};

export const printReport = (report: TabularReport): void => {
  const printWindow: Window | null = window.open('', '_blank');
  if (!printWindow) throw new Error('Allow pop-ups to print this contact list.');
  printWindow.document.write(toReportPrintHtml(report));
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
};
