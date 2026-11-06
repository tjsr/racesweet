import { IconButton, SvgIcon, Tooltip, Typography } from '@mui/material';
import React from 'react';

export interface IdentifierDisplayProps {
  label: string;
  value: string;
}

export const copyToClipboard = (value: string): void => {
  void navigator.clipboard.writeText(value);
};

const CopyIcon = (): React.ReactElement => <SvgIcon aria-hidden="true" fontSize="small">
  <path d="M19 21H8V7h11m0-2H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2M16 1H4C2.9 1 2 1.9 2 3v14h2V3h12z" />
</SvgIcon>;

export const IdentifierDisplay = (props: IdentifierDisplayProps): React.ReactElement => {
  const copyValue = (): void => copyToClipboard(props.value);

  return <Typography aria-label={props.label} component="div" sx={{ alignItems: 'center', display: 'flex', gap: 0.5 }} variant="body2">
    {props.label}: {props.value}
    <Tooltip title={`Copy ${props.label}`}>
      <IconButton aria-label={`Copy ${props.label}`} onClick={copyValue} size="small">
        <CopyIcon />
      </IconButton>
    </Tooltip>
  </Typography>;
};
