import type { ManualCrossingAcknowledgement, ManualCrossingCommand } from './manualCrossing.js';

export type ManualCrossingDeliveryStatus = 'draft' | 'queued' | 'sending' | 'accepted' | 'rejected' | 'needs-attention';
export interface ManualCrossingOutboxItem {
  acknowledgement?: ManualCrossingAcknowledgement;
  attempts: number;
  command: ManualCrossingCommand;
  lastError?: string;
  nextRetryAt?: string;
  status: ManualCrossingDeliveryStatus;
}
export interface ManualCrossingOutboxState {
  items: ManualCrossingOutboxItem[];
  quarantined: string[];
}
/** UI contract: implementation and storage remain in the service/app layers. */
export interface ManualCrossingOutboxController {
  readonly snapshot: ManualCrossingOutboxState;
  retry: (force?: boolean) => Promise<void>;
  submit: (command: ManualCrossingCommand) => Promise<void>;
  subscribe: (listener: (state: ManualCrossingOutboxState) => void) => (() => void);
}
export interface ManualTimingOutboxConnection {
  error: string;
  outbox?: ManualCrossingOutboxController;
}
