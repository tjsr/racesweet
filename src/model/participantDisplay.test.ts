import type { EventParticipant } from './eventparticipant.js';
import { getParticipantDisplayName } from './participantDisplay.js';

describe('participant display name', () => {
  const createParticipant = (identifiers: EventParticipant['identifiers']): EventParticipant => ({
    categoryId: 'category-id',
    currentResult: undefined,
    entrantId: 'entrant-id',
    firstname: '',
    id: 'participant-id',
    identifiers,
    lastRecordTime: null,
    resultDuration: null,
    surname: '',
  });

  it('labels blank-name participants by transponder before race number', () => {
    expect(getParticipantDisplayName(createParticipant([{ fromTime: undefined, toTime: undefined, txNo: 1234 }] as unknown as EventParticipant['identifiers']))).toBe('Unknown participant with Transponder #1234');
    expect(getParticipantDisplayName(createParticipant([{ fromTime: undefined, racePlate: '999', toTime: undefined }] as unknown as EventParticipant['identifiers']))).toBe('Unknown participant #999');
  });
});
