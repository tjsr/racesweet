import { Dialog, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { ReactElement } from 'react';

interface RestartRequiredDialogProps {
  checking?: boolean;
  error?: string;
  launchedVersion?: string;
  requiredVersion: string;
}

const formatVersion = (version: string | undefined): string =>
  version ? new Date(version).toLocaleString() : 'Checking application version…';

export const RestartRequiredDialog = (props: RestartRequiredDialogProps): ReactElement => (
  <Dialog
    aria-labelledby="restart-required-title"
    open
  >
    <DialogTitle id="restart-required-title">
      {props.checking ? 'Checking RaceSweet version' : 'RaceSweet must be restarted'}
    </DialogTitle>
    <DialogContent>
      {props.checking ? (
        <Typography>Checking that this renderer matches the launched application process.</Typography>
      ) : (
        <>
          <Typography sx={{ marginBottom: 2 }}>
            RaceSweet loaded code that is newer than the application process that launched it.
          </Typography>
          <Typography sx={{ marginBottom: 2 }}>
            Close RaceSweet completely and start it again before continuing. Reloading this page is not sufficient.
          </Typography>
        </>
      )}
      {props.error ? (
        <Typography color="error">
          The launch version could not be verified: {props.error}
        </Typography>
      ) : (
        <Typography color="text.secondary" variant="body2">
          Launched: {formatVersion(props.launchedVersion)}. Required: {formatVersion(props.requiredVersion)}.
        </Typography>
      )}
    </DialogContent>
  </Dialog>
);
