import { describe, expect, it } from 'vitest';
import { EventParticipant } from '../model/eventparticipant';
import { ParticipantPassingRecord, RECORD_TX_CROSSING } from '../model/timerecord';
import { crossingMatchesParticipantIdentifiers, entrantHasPlate } from './participantMatch';

const createParticipant = (racePlate: string | number): EventParticipant => ({
  categoryId: 'category-1',
  currentResult: undefined,
  entrantId: 'entrant-1',
  firstname: 'Plate',
  id: 'participant-1',
  identifiers: [{ fromTime: undefined, racePlate, toTime: undefined } as unknown as EventParticipant['identifiers'][number]],
  lastRecordTime: null,
  resultDuration: null,
  surname: 'Rider',
});

describe('participantMatch', () => {
  it('matches race plates when one side is numeric and the other is a string', () => {
    const participant = createParticipant(123);

    expect(entrantHasPlate('123', participant, new Date('2026-05-29T10:06:00.000Z'))).toBe(true);
    expect(entrantHasPlate(123, createParticipant('123'), new Date('2026-05-29T10:06:00.000Z'))).toBe(true);
  });

  it('matches plate-only crossing records to participant racePlate identifiers across string and number values', () => {
    const participant = createParticipant(123);
    const crossing = {
      id: 'plate-crossing-1',
      isValid: true,
      plateNumber: '123',
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord & { plateNumber: string };

    expect(crossingMatchesParticipantIdentifiers(participant, crossing)).toBe(true);
  });
});
