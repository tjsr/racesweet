import { Button, type ButtonProps, CircularProgress } from "@mui/material";
import React from "react";

interface AsyncButtonProps extends Omit<
  ButtonProps,
  "children" | "onClick" | "startIcon"
> {
  children: React.ReactNode;
  loadingAriaLabel: string;
  onAsyncClick: () => void | Promise<void>;
  onAsyncError?: (error: unknown) => void;
}

/**
 * A button for operations whose completion depends on an asynchronous result.
 * It prevents duplicate operations and gives immediate, accessible feedback.
 */
export const AsyncButton = (props: AsyncButtonProps): React.ReactElement => {
  const {
    children,
    disabled,
    loadingAriaLabel,
    onAsyncClick,
    onAsyncError,
    ...buttonProps
  } = props;
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  const handleClick = (): void => {
    setIsLoading(true);
    Promise.resolve(onAsyncClick())
      .catch((error: unknown): void => {
        if (onAsyncError) {
          onAsyncError(error);
          return;
        }
        console.error("Asynchronous button action failed:", error);
      })
      .finally((): void => setIsLoading(false));
  };

  return (
    <Button
      {...buttonProps}
      disabled={disabled || isLoading}
      onClick={handleClick}
      startIcon={
        isLoading ? (
          <CircularProgress
            aria-label={loadingAriaLabel}
            color="inherit"
            size={16}
          />
        ) : undefined
      }
    >
      {children}
    </Button>
  );
};
