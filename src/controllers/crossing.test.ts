import { assignEntrantToTime } from './crossing.js';
import type { EventCategoryId } from '../model/eventcategory.js';
import type { EventParticipant } from '../model/eventparticipant.js';
import type { ParticipantPassingRecord } from '../model/timerecord.js';

describe('assignEntrantToTime', () => {
  it('falls back to plate lookup when a manual crossing has an unknown TxNo but a known plate', () => {
    const participant: EventParticipant = {
      categoryId: 'category-1',
      currentResult: undefined,
      entrantId: 'entrant-1',
      firstname: 'Pat',
      id: 'participant-1',
      identifiers: [
        { fromTime: undefined, racePlate: '101', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 100101 },
      ] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const participants = new Map([[participant.id, participant]]);
    const crossing = {
      chipCode: 999999,
      id: 'crossing-1',
      plateNumber: '101',
      recordType: 16,
      sequence: 1,
      source: 'manual-source',
      time: new Date('2026-05-29T10:07:30.250Z'),
    } as ParticipantPassingRecord & { chipCode: number; plateNumber: string };

    assignEntrantToTime(participants, crossing);

    expect(crossing.participantId).toBe(participant.id);
    expect(crossing.entrantId).toBe(participant.entrantId);
  });

  it('prefers the entrant in the participating session category when a transmitter is shared', () => {
    const sportsman: EventParticipant = {
      categoryId: 'sportsman' as EventCategoryId,
      currentResult: undefined,
      entrantId: 'entrant-sportsman',
      firstname: 'Darryl',
      id: 'participant-sportsman',
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 7300 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Howden',
    };
    const nascar: EventParticipant = {
      categoryId: 'nascar' as EventCategoryId,
      currentResult: undefined,
      entrantId: 'entrant-nascar',
      firstname: 'Darryl',
      id: 'participant-nascar',
      identifiers: [{ fromTime: undefined, toTime: undefined, txNo: 7300 }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Howden',
    };
    const participants = new Map([
      [sportsman.id, sportsman],
      [nascar.id, nascar],
    ]);
    const crossing = {
      chipCode: 7300,
      id: 'crossing-2',
      recordType: 16,
      sequence: 1,
      source: 'manual-source',
      time: new Date('2026-05-29T10:07:30.250Z'),
    } as ParticipantPassingRecord & { chipCode: number };

    assignEntrantToTime(participants, crossing, false, undefined, new Set<EventCategoryId>(['nascar' as EventCategoryId]));

    expect(crossing.participantId).toBe(nascar.id);
    expect(crossing.entrantId).toBe(nascar.entrantId);
  });
});
