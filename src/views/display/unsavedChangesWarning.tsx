import { WarningModal, type WarningModalAction } from './warningModal.js';
import React from 'react';

export type UnsavedChangesGuard = (action: () => void | Promise<void>) => void;

interface UseUnsavedChangesWarningOptions {
  hasUnsavedChanges: boolean;
  itemName?: string;
  itemType: string;
  onDiscard?: () => void;
  onSave: () => boolean | Promise<boolean>;
  onUnsavedChangesGuardChange?: (guard: UnsavedChangesGuard | undefined) => void;
}

interface PendingNavigation {
  action: () => void | Promise<void>;
  itemName: string;
}

interface UseUnsavedChangesWarningResult {
  requestExit: UnsavedChangesGuard;
  warningModal: React.ReactElement | null;
}

export const useUnsavedChangesWarning = (options: UseUnsavedChangesWarningOptions): UseUnsavedChangesWarningResult => {
  const [pendingNavigation, setPendingNavigation] = React.useState<PendingNavigation | undefined>(undefined);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const requestExit = React.useCallback((action: () => void | Promise<void>): void => {
    const currentOptions = optionsRef.current;
    if (currentOptions.hasUnsavedChanges) {
      setPendingNavigation({
        action,
        itemName: currentOptions.itemName || currentOptions.itemType,
      });
      return;
    }

    void action();
  }, []);

  React.useEffect(() => {
    options.onUnsavedChangesGuardChange?.(requestExit);
    return () => {
      options.onUnsavedChangesGuardChange?.(undefined);
    };
  }, [options.onUnsavedChangesGuardChange, requestExit]);

  const saveAndContinue = async (): Promise<void> => {
    if (!pendingNavigation) {
      return;
    }

    let saved = false;
    try {
      saved = await optionsRef.current.onSave();
    } catch {
      return;
    }

    if (!saved) {
      return;
    }

    const action = pendingNavigation.action;
    setPendingNavigation(undefined);
    await action();
  };

  const discardAndContinue = (): void => {
    if (!pendingNavigation) {
      return;
    }

    const action = pendingNavigation.action;
    setPendingNavigation(undefined);
    optionsRef.current.onDiscard?.();
    void action();
  };

  const actions: WarningModalAction[] = pendingNavigation ? [
    {
      label: 'Save',
      onClick: () => {
        void saveAndContinue();
      },
    },
    {
      label: 'Discard',
      onClick: discardAndContinue,
    },
    {
      label: 'Cancel',
      onClick: () => setPendingNavigation(undefined),
    },
  ] : [];

  return {
    requestExit,
    warningModal: pendingNavigation ? (
      <WarningModal
        actions={actions}
        ariaLabel={`Unsaved ${options.itemType} changes`}
        message={`You have unsaved changes to ${options.itemType} ${pendingNavigation.itemName} - save or discard changes?`}
        title="Unsaved Changes"
      />
    ) : null,
  };
};
