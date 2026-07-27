import { type SxProps, TextField, type Theme } from "@mui/material";
import React from "react";

export interface NumericInputProps {
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
  helperText?: string;
  id?: string;
  label?: string;
  onBlur?: (value: string) => void;
  onChange: (value: string) => void;
  required?: boolean;
  sx?: SxProps<Theme>;
  value: number | string;
}

const numericCharactersOnly = (value: string): string =>
  value.replace(/\D/g, "");

export const NumericInput = (props: NumericInputProps): React.ReactElement => {
  const handleBlur = (): void => {
    props.onBlur?.(numericCharactersOnly(props.value.toString()));
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    props.onChange(numericCharactersOnly(event.target.value));
  };

  return (
    <TextField
      className={props.className}
      disabled={props.disabled}
      helperText={props.helperText}
      id={props.id}
      label={props.label}
      required={props.required}
      slotProps={{
        htmlInput: {
          "aria-label": props.ariaLabel,
          inputMode: "numeric",
          pattern: "[0-9]*",
        },
      }}
      sx={[
        { width: "calc(5ch + 32px)" },
        ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
      ]}
      type="text"
      value={numericCharactersOnly(props.value.toString())}
      onBlur={handleBlur}
      onChange={handleChange}
    />
  );
};
