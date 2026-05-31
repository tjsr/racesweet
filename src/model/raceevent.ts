import type { EventId } from './types.ts';

export interface RaceEvent {
  id: EventId;
  apicalId: number;
  name: string;
  date: string;
  companyName: string;
}
