import type { IdType } from './types.ts';

export type EventId = IdType;

export interface RaceEvent {
  id: EventId;
  apicalId: number;
  name: string;
  date: string;
  companyName: string;
}

export type SessionId = IdType;
