export interface HandicapRoundSnapshot {
  confidenceFactor: number | null;
  eventId: number;
  eventNumber: number;
  medianLapTime: number | null;
  ratioScore: number | null;
}

export interface HandicapRiderSnapshot {
  category: string;
  firstName: string;
  handicapRatio: number;
  name: string;
  roundsByEventId: Record<string, HandicapRoundSnapshot>;
  surname: string;
}

export interface HandicapSnapshotEvent {
  eventDate: string;
  eventId: number;
  name: string;
}

export interface HandicapSnapshot {
  events: HandicapSnapshotEvent[];
  generatedAt: string;
  riders: HandicapRiderSnapshot[];
  schemaVersion: string;
}
