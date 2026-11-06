import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import React from 'react';
import type { EventCatalogState } from '../../catalog/eventCatalog.js';
import { type StartListLayout, createStartListExport } from '../../export/startListReport.js';
import { type TabularReport, createReportPdf, downloadReportBlob, printReport, toReportCsv } from '../../export/tabularReport.js';
import type { EventId, SessionId } from '../../model/raceevent.js';
import { type StartListReportProjection, type StartListReportRow, buildStartListReport, filterStartListRows } from '../../processing/startListReport.js';

export interface StartListsGridsReportProps {
  catalog: EventCatalogState;
  eventId?: EventId;
  sessionId?: SessionId;
}

type ExportAction = 'csv' | 'pdf' | 'print';

const StartListTable = ({ report }: { report: TabularReport }): React.ReactElement => <TableContainer>
  <Table aria-label="Start list report table" size="small">
    <TableHead><TableRow>{report.columns.map((column: string): React.ReactElement => <TableCell key={column}>{column}</TableCell>)}</TableRow></TableHead>
    <TableBody>{report.rows.map((row: string[], index: number): React.ReactElement => <TableRow key={index}>
      {row.map((value: string, column: number): React.ReactElement => <TableCell key={column} sx={{ overflowWrap: 'anywhere' }}>{value}</TableCell>)}
    </TableRow>)}</TableBody>
  </Table>
</TableContainer>;

const RaceGrid = ({ rows }: { rows: StartListReportRow[] }): React.ReactElement => <Box aria-label="Race grid"
  sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
  {rows.map((row: StartListReportRow): React.ReactElement => <Card key={row.entryId || row.entrantId} variant="outlined">
    <CardContent>
      <Typography variant="subtitle2">{row.startGroup}</Typography>
      <Typography variant="h5">Position {row.gridPosition ?? 'Unassigned'}</Typography>
      <Typography>{row.raceNumber || 'Missing number'} · {row.entrantName}</Typography>
      <Typography>{row.categoryName}</Typography>
      <Typography variant="caption" component="div">Entrant ID: {row.entrantId}</Typography>
      {row.entryId && <Typography variant="caption" component="div">Entry ID: {row.entryId}</Typography>}
      {row.completeness.length > 0 && <Typography color="warning.main">{row.completeness.join('; ')}</Typography>}
    </CardContent>
  </Card>)}
</Box>;

export const StartListsGridsReport = ({ catalog, eventId, sessionId }: StartListsGridsReportProps): React.ReactElement => {
  const [categoryId, setCategoryId] = React.useState<string>('');
  const [groupId, setGroupId] = React.useState<string>('');
  const [layout, setLayout] = React.useState<StartListLayout>('start-list');
  const [error, setError] = React.useState<string>('');
  const [pendingExport, setPendingExport] = React.useState<ExportAction | undefined>(undefined);
  React.useEffect((): void => {
    setCategoryId(''); setGroupId(''); setError(''); 
  }, [eventId, sessionId]);
  const projection: StartListReportProjection = buildStartListReport(catalog, eventId, sessionId);
  const rows: StartListReportRow[] = filterStartListRows(projection.rows, { categoryId, startGroupId: groupId });
  const report: TabularReport = createStartListExport(rows, layout,
    `${projection.eventName} — ${projection.sessionName} — ${layout === 'race-grid' ? 'Race grid' : layout === 'marshal-sheet' ? 'Marshal sheet' : 'Start list'}${rows.length === 0 ? ' (empty)' : ''}`);
  const validSelection: boolean = !!projection.eventName && !!projection.sessionName;
  const groups: Array<[string, string]> = [...new Map(projection.rows.map((row: StartListReportRow): [string, string] =>
    [row.startGroupId, row.startGroup])).entries()];
  const warningCount: number = projection.warnings.length + rows.filter((row: StartListReportRow): boolean => row.duplicatePosition).length;
  const exportReport = (action: ExportAction): void => {
    setPendingExport(undefined);
    setError('');
    Promise.resolve().then((): void | Promise<void> => {
      if (action === 'print') return printReport(report);
      if (action === 'csv') return downloadReportBlob(new Blob([toReportCsv(report)], { type: 'text/csv;charset=utf-8' }), 'start-list.csv');
      return createReportPdf(report).then((blob: Blob): void => downloadReportBlob(blob, 'start-list.pdf'));
    }).catch((failure: Error): void => setError(failure.message));
  };
  const requestExport = (action: ExportAction): void => rows.length === 0 ? setPendingExport(action) : exportReport(action);
  return <Stack spacing={2} sx={{ minWidth: 0 }}>
    <Typography variant="h5">Start Lists &amp; Grids</Typography>
    {!validSelection && <Alert severity="info">Select an event and session to prepare a start list.</Alert>}
    {error && <Alert severity="error">{error}</Alert>}
    <Stack direction={{ sm: 'row', xs: 'column' }} spacing={1} sx={{ '@media print': { display: 'none' } }}>
      <TextField select label="Start list category" value={categoryId} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setCategoryId(event.target.value)}>
        <MenuItem value="">All categories</MenuItem>
        {catalog.categories.filter((category): boolean => category.eventId === eventId && !category.deleted)
          .map((category): React.ReactElement => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
      </TextField>
      <TextField select label="Start group" value={groupId} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setGroupId(event.target.value)}>
        <MenuItem value="">All groups</MenuItem>{groups.map(([id, label]: [string, string]): React.ReactElement => <MenuItem key={id} value={id}>{label}</MenuItem>)}
      </TextField>
      <TextField select label="Start list layout" value={layout} onChange={(event: React.ChangeEvent<HTMLInputElement>): void => setLayout(event.target.value as StartListLayout)}>
        <MenuItem value="start-list">Traditional start list</MenuItem><MenuItem value="race-grid">Race grid</MenuItem><MenuItem value="marshal-sheet">Compact marshal sheet</MenuItem>
      </TextField>
    </Stack>
    {warningCount > 0 && <Alert severity="warning">{warningCount} data warning{warningCount === 1 ? '' : 's'}: {[...projection.warnings,
      ...(rows.some((row: StartListReportRow): boolean => row.duplicatePosition) ? ['Duplicate explicit positions are shown.'] : [])].join(' ')}</Alert>}
    <Typography>{rows.length} start list row{rows.length === 1 ? '' : 's'}</Typography>
    {validSelection && rows.length === 0 && <Typography>No eligible entries match the selected event, session, and filters.</Typography>}
    {layout === 'race-grid' ? <RaceGrid rows={rows} /> : <StartListTable report={report} />}
    <Stack direction="row" spacing={1} sx={{ '@media print': { display: 'none' }, flexWrap: 'wrap' }}>
      <Button disabled={!validSelection} onClick={(): void => requestExport('print')}>Print</Button>
      <Button disabled={!validSelection} onClick={(): void => requestExport('csv')}>Download CSV</Button>
      <Button disabled={!validSelection} onClick={(): void => requestExport('pdf')}>Download PDF</Button>
    </Stack>
    <Dialog open={pendingExport !== undefined} onClose={(): void => setPendingExport(undefined)}>
      <DialogTitle>Export an empty report?</DialogTitle><DialogContent>No rows match the current filters. The output will be labelled empty.</DialogContent>
      <DialogActions><Button onClick={(): void => setPendingExport(undefined)}>Cancel</Button>
        <Button onClick={(): void => {
          if (pendingExport) exportReport(pendingExport); 
        }}>Export empty report</Button></DialogActions>
    </Dialog>
  </Stack>;
};
