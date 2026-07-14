import * as vscode from 'vscode';
import { parseSrt, type SrtRecord } from './parser.js';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const getCell = (record: SrtRecord, key: keyof SrtRecord): string => escapeHtml(record[key]);

const createHtml = (fileName: string, records: SrtRecord[]): string => {
  const headers: ReadonlyArray<{ key: keyof SrtRecord; label: string }> = [
    { key: 'recordNumber', label: '#' }, { key: 'drtCode', label: 'DRT' }, { key: 'controlMeaning', label: 'Meaning' },
    { key: 'timeOfDay', label: 'Time of day' }, { key: 'absoluteTicks', label: 'Absolute ticks' }, { key: 'transmitter', label: 'TxNo' },
    { key: 'lineNumber', label: 'Line' }, { key: 'loopNumber', label: 'Loop' }, { key: 'confidence', label: 'Confidence' },
    { key: 'status', label: 'Status' }, { key: 'hitCount', label: 'Hits' }, { key: 'raw', label: 'Raw record' },
  ];
  const headerHtml: string = headers.map(({ label }): string => `<th>${label}</th>`).join('');
  const rowsHtml: string = records.map((record: SrtRecord): string => `<tr>${headers.map(({ key }): string => `<td>${getCell(record, key)}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family); padding: 0 16px; }
    table { border-collapse: collapse; font-size: 12px; width: 100%; } th { background: var(--vscode-editorWidget-background); position: sticky; top: 0; }
    td, th { border: 1px solid var(--vscode-panel-border); padding: 5px 7px; text-align: left; white-space: nowrap; } td:last-child { font-family: var(--vscode-editor-font-family); }
    #filter { background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); color: var(--vscode-input-foreground); margin: 0 0 12px; padding: 6px; width: 300px; }
  </style></head><body><h2>${escapeHtml(fileName)} <small>(${records.length} decoded records)</small></h2>
  <input id="filter" placeholder="Filter decoded fields or raw records"><table><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>
  <script>document.getElementById('filter').addEventListener('input', (event) => { const query = event.target.value.toLowerCase(); document.querySelectorAll('tbody tr').forEach((row) => { row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none'; }); });</script>
  </body></html>`;
};

export const activate = (context: vscode.ExtensionContext): void => {
  const openInspector = async (resource?: vscode.Uri): Promise<void> => {
    const uri: vscode.Uri | undefined = resource ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
      void vscode.window.showInformationMessage('Select an SRT or ERF file before opening the SRT Inspector.');
      return;
    }
    const bytes: Uint8Array = await vscode.workspace.fs.readFile(uri);
    const text: string = new TextDecoder('latin1').decode(bytes);
    const panel: vscode.WebviewPanel = vscode.window.createWebviewPanel('srtInspector', `SRT Inspector: ${vscode.workspace.asRelativePath(uri)}`, vscode.ViewColumn.Beside, { enableFindWidget: true });
    panel.webview.html = createHtml(vscode.workspace.asRelativePath(uri), parseSrt(text));
  };
  context.subscriptions.push(vscode.commands.registerCommand('srtInspector.open', openInspector));
};

export const deactivate = (): void => undefined;
