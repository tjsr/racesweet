import React from 'react';
import { LapTimesReport } from '../views/reports/LapTimesReport.tsx';
import type { EventCategory } from '../model/eventcategory.ts';
import type { EventParticipant, EventParticipantId } from '../model/eventparticipant.ts';
import type { ParticipantPassingRecord } from '../model/timerecord.ts';

// Sample data for development/demonstration. Replace with real data from the
// main process via IPC once the data pipeline is wired up.
const sampleCategories: EventCategory[] = [
  { id: 'cat-a', name: 'Class A' },
  { id: 'cat-b', name: 'Class B' },
];

const sampleParticipants: EventParticipant[] = [
  {
    id: '1',
    firstname: 'Alice',
    surname: 'Smith',
    categoryId: 'cat-a',
    lastRecordTime: null,
    resultDuration: null,
    currentResult: undefined,
    identifiers: [],
  },
  {
    id: '2',
    firstname: 'Bob',
    surname: 'Jones',
    categoryId: 'cat-a',
    lastRecordTime: null,
    resultDuration: null,
    currentResult: undefined,
    identifiers: [],
  },
  {
    id: '3',
    firstname: 'Carol',
    surname: 'Williams',
    categoryId: 'cat-b',
    lastRecordTime: null,
    resultDuration: null,
    currentResult: undefined,
    identifiers: [],
  },
];

const makeLaps = (
  participantId: string,
  count: number,
  baseLapMs: number
): ParticipantPassingRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${participantId}-lap-${i + 1}`,
    participantId,
    lapNo: i + 1,
    lapTime: baseLapMs + Math.floor(Math.random() * 5000 - 2500),
    elapsedTime: (i + 1) * baseLapMs,
    isExcluded: false,
    isValid: true,
    recordType: 16,
    sequence: i + 1,
    source: 'sample',
  }));

const samplePassings = new Map<EventParticipantId, ParticipantPassingRecord[]>([
  ['1', makeLaps('1', 12, 90000)],
  ['2', makeLaps('2', 10, 95000)],
  ['3', makeLaps('3', 8, 88000)],
]);

const App = () => (
  <div style={{ maxWidth: '100%', padding: '0' }}>
    <LapTimesReport
      title="Lap Times Report"
      participants={sampleParticipants}
      categories={sampleCategories}
      passings={samplePassings}
    />
  </div>
);

export default App;
