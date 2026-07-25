import { Button, TextField } from '@mui/material';
import React from 'react';

interface FileSelectionAction {
  disabled?: boolean;
  label: string;
  onClick: () => void | Promise<void>;
}

interface FileSelectionFieldProps {
  accept?: string;
  actions?: FileSelectionAction[];
  ariaLabel: string;
  disabled?: boolean;
  fileInputAriaLabel?: string;
  label: string;
  onSelectFile?: (file: File) => void | Promise<void>;
  placeholder: string;
  value: string;
}

export const FileSelectionField = (props: FileSelectionFieldProps): React.ReactElement => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const actions: FileSelectionAction[] = [
    ...(props.actions || []),
    ...(props.onSelectFile ? [{
      disabled: props.disabled,
      label: 'Select File',
      onClick: (): void => fileInputRef.current?.click(),
    }] : []),
  ];

  return (
    <div className="file-selection-field">
      <TextField
        fullWidth
        label={props.label}
        placeholder={props.placeholder}
        slotProps={{ htmlInput: { 'aria-label': props.ariaLabel, readOnly: true } }}
        value={props.value}
      />
      {props.onSelectFile ? (
        <input
          accept={props.accept}
          aria-label={props.fileInputAriaLabel || `${props.ariaLabel} File input`}
          className="file-selection-field__native-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void props.onSelectFile!(file);
            }
            event.target.value = '';
          }}
          ref={fileInputRef}
          type="file"
        />
      ) : null}
      {actions.map((action) => (
        <Button
          aria-label={`${props.ariaLabel} ${action.label}`}
          disabled={action.disabled}
          key={action.label}
          onClick={() => {
            void action.onClick();
          }}
          type="button"
          variant="outlined"
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
};
