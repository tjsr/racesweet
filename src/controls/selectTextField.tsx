import { TextField, type TextFieldOwnerState, type TextFieldProps } from "@mui/material";
import React from "react";

export type SelectTextFieldProps = Omit<TextFieldProps, "select">;

export const SelectTextField = (props: SelectTextFieldProps): React.ReactElement => {
  const { slotProps, ...textFieldProps } = props;
  const inputLabelSlotProps = slotProps?.inputLabel;

  return (
    <TextField
      {...textFieldProps}
      select
      slotProps={{
        ...slotProps,
        inputLabel: (ownerState: TextFieldOwnerState) => ({
          ...(typeof inputLabelSlotProps === "function"
            ? inputLabelSlotProps(ownerState)
            : inputLabelSlotProps),
          shrink: true,
        }),
      }}
    />
  );
};
