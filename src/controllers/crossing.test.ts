import { assignEntrantToTime } from './crossing.js';
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
});
