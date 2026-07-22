export type SessionSourceReloadMode = 'all' | 'categories' | 'entrants' | 'time-records';

export const SESSION_SOURCE_RELOAD_OPTIONS: Array<{ label: string; value: SessionSourceReloadMode }> = [
  { label: 'All data', value: 'all' },
  { label: 'Categories', value: 'categories' },
  { label: 'Entrants', value: 'entrants' },
  { label: 'Time records', value: 'time-records' },
];

export interface SessionSourceReloadSummaryCounts {
  created: number;
  deleted: number;
  updated: number;
}

export interface SessionSourceReloadSummary {
  categories: SessionSourceReloadSummaryCounts;
  crossings: SessionSourceReloadSummaryCounts;
  events: SessionSourceReloadSummaryCounts;
  flags: SessionSourceReloadSummaryCounts;
  participants: SessionSourceReloadSummaryCounts;
  sessions: SessionSourceReloadSummaryCounts;
  teams: SessionSourceReloadSummaryCounts;
}
