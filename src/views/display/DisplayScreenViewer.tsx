import { Alert, Box, Typography } from '@mui/material';
import React from 'react';
import type { DisplaySnapshot } from '../../processing/displayProjection.js';
import { DisplayScreenCanvas } from './DisplayScreenCanvas.js';

interface DisplayScreenViewerProps {
  token: string;
}

export const DisplayScreenViewer = ({ token }: DisplayScreenViewerProps): React.ReactElement => {
  const [snapshot, setSnapshot] = React.useState<DisplaySnapshot | undefined>();
  const [stale, setStale] = React.useState<boolean>(false);
  const [unavailable, setUnavailable] = React.useState<boolean>(false);

  React.useEffect((): (() => void) => {
    const stream: EventSource = new EventSource(`/api/v1/displays/view/${token}/events`);
    const onSnapshot = (event: MessageEvent): void => {
      try {
        setSnapshot(JSON.parse(event.data) as DisplaySnapshot);
        setStale(false);
      } catch {
        setStale(true);
      }
    };
    const onUnavailable = (): void => {
      setUnavailable(true);
      stream.close();
    };
    stream.addEventListener('snapshot', onSnapshot as EventListener);
    stream.addEventListener('unavailable', onUnavailable);
    stream.onerror = (): void => setStale(true);
    return (): void => stream.close();
  }, [token]);

  if (unavailable) return <Typography component="main">Display unavailable.</Typography>;
  return <Box component="main" sx={{ minHeight: '100vh', padding: { md: 3, xs: 1 } }}>
    {stale ? <Alert severity="warning" sx={{ mb: 1 }}>Live updates are delayed. Showing the last received display.</Alert> : null}
    {snapshot ? <DisplayScreenCanvas items={snapshot.items} projection={snapshot.projection} />
      : <Typography>Connecting to display…</Typography>}
  </Box>;
};
