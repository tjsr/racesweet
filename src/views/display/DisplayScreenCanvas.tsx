import { Box, ButtonBase, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import React from 'react';
import type { DisplayComponent } from '../../model/displayScreen.js';
import type { DisplayProjection, DisplayResultRow } from '../../processing/displayProjection.js';

interface DisplayScreenCanvasProps {
  items: DisplayComponent[];
  onSelect?: (id: string) => void;
  projection: DisplayProjection;
  selectedId?: string;
}

const DisplayClock = ({ component, projection }: {
  component: Extract<DisplayComponent, { type: 'clock' }>;
  projection: DisplayProjection;
}): React.ReactElement => {
  const [now, setNow] = React.useState<Date>(new Date());
  React.useEffect((): (() => void) => {
    const interval: number = window.setInterval((): void => setNow(new Date()), 1_000);
    return (): void => window.clearInterval(interval);
  }, []);
  const format: Intl.DateTimeFormatOptions = component.settings.format === 'date-time'
    ? { dateStyle: 'medium', timeStyle: 'medium' }
    : { timeStyle: 'medium' };
  return <Typography variant="h3" sx={{ fontSize: 'clamp(1.25rem, 4vw, 2.5rem)', overflowWrap: 'anywhere' }}>
    {new Intl.DateTimeFormat(undefined, {
      ...format,
      timeZone: component.settings.timeZone === 'event' ? projection.eventTimeZone : undefined,
    }).format(now)}</Typography>;
};

const DisplayResultTable = ({ component, projection }: {
  component: Extract<DisplayComponent, { type: 'leaderboard' | 'results-table' }>;
  projection: DisplayProjection;
}): React.ReactElement => {
  const rows: DisplayResultRow[] = projection.rows
    .filter((row: DisplayResultRow): boolean => component.settings.scope === 'overall' ||
      row.categoryId === component.settings.categoryId)
    .slice(0, component.settings.limit);
  return <Table size="small" aria-label={component.type === 'leaderboard' ? 'Leaderboard' : 'Results table'}>
    <TableHead><TableRow><TableCell>Pos</TableCell><TableCell>Entrant</TableCell><TableCell>Laps</TableCell>
      {component.type === 'results-table' ? <TableCell>Elapsed</TableCell> : null}
    </TableRow></TableHead>
    <TableBody>{rows.map((row: DisplayResultRow): React.ReactElement => <TableRow key={row.entrantId}>
      <TableCell>{row.position}</TableCell><TableCell>{row.entrantName}</TableCell><TableCell>{row.laps}</TableCell>
      {component.type === 'results-table' ? <TableCell>{row.elapsedMilliseconds === undefined
        ? '—' : `${(row.elapsedMilliseconds / 1_000).toFixed(1)} s`}</TableCell> : null}
    </TableRow>)}</TableBody>
  </Table>;
};

const DisplayTileContent = ({ component, projection }: {
  component: DisplayComponent;
  projection: DisplayProjection;
}): React.ReactElement => {
  switch (component.type) {
  case 'event-title':
    return <Box sx={{ maxWidth: '100%', minWidth: 0 }}>
      <Typography variant="h3" sx={{ fontSize: 'clamp(1.25rem, 4vw, 2.5rem)', overflowWrap: 'anywhere' }}>
        {projection.eventName}</Typography>
      {component.settings.showSession && projection.sessionName
        ? <Typography variant="h5" sx={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', overflowWrap: 'anywhere' }}>
          {projection.sessionName}</Typography> : null}</Box>;
  case 'clock':
    return <DisplayClock component={component} projection={projection} />;
  case 'leaderboard':
  case 'results-table':
    return <DisplayResultTable component={component} projection={projection} />;
  case 'sponsor-image':
    return component.settings.mediaDataUrl
      ? <Box component="img" alt={component.settings.alt} src={component.settings.mediaDataUrl}
        sx={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
      : <Typography>Choose a sponsor image</Typography>;
  case 'text-panel':
    return <Typography sx={{ whiteSpace: 'pre-wrap' }}>{component.settings.text}</Typography>;
  }
};

export const DisplayScreenCanvas = ({ items, onSelect, projection, selectedId }: DisplayScreenCanvasProps): React.ReactElement => (
  <Box sx={{ display: 'grid', gap: 1, gridAutoRows: 'minmax(72px, auto)', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', width: '100%' }}>
    {items.map((component: DisplayComponent): React.ReactElement => {
      const tile: React.ReactElement = <Paper elevation={2} sx={{
        alignItems: 'center', display: 'flex', height: '100%', justifyContent: 'center',
        minWidth: 0, outline: selectedId === component.id ? '3px solid #1976d2' : undefined,
        overflow: 'auto', padding: 2,
      }}><DisplayTileContent component={component} projection={projection} /></Paper>;
      return <Box key={component.id} sx={{
        gridColumn: { md: `${component.x + 1} / span ${component.width}`, xs: '1 / -1' },
        gridRow: { md: `${component.y + 1} / span ${component.height}`, xs: 'auto' },
        minHeight: 72 * component.height,
        zIndex: component.zIndex,
      }}>{onSelect ? <ButtonBase aria-label={`Select ${component.type} component`} onClick={(): void => onSelect(component.id)}
          sx={{ display: 'block', height: '100%', textAlign: 'inherit', width: '100%' }}>{tile}</ButtonBase> : tile}</Box>;
    })}
  </Box>
);
