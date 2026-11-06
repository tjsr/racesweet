import React from 'react';
import { Button, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { ResponsiveDialog } from '../admin/adminPrimitives.js';

export interface WarningModalAction {
  label: string;
  onClick: () => void;
}

interface WarningModalProps {
  actions: WarningModalAction[];
  ariaLabel: string;
  message: string;
  title: string;
}

export const WarningModal = (props: WarningModalProps): React.ReactElement => (
  <ResponsiveDialog aria-label={props.ariaLabel} className="warning-modal-backdrop" disablePortal open
    slotProps={{ paper: { 'aria-label': props.ariaLabel, className: 'warning-modal error', role: 'dialog' } }}>
    <DialogTitle>{props.title}</DialogTitle>
    <DialogContent>{props.message}</DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
      {props.actions.map((action) => (
        <Button key={action.label} type="button" onClick={action.onClick} sx={{ minHeight: 48 }}>
          {action.label}
        </Button>
      ))}
    </DialogActions>
  </ResponsiveDialog>
);
