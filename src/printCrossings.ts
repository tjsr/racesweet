import { ApicalTestRace } from './testdata/apical.ts';
import { OutreachTeamsRaceTestSession } from './testdata/outreach.ts';
import type { ParticipantPassingRecord } from './model/timerecord.ts';
import { RfidIndividualTestRace } from './testdata/rfid.ts';
import type { TestSession } from './testdata/testsession.ts';
import colors from 'colors';
import { getCliTable } from "./controllers/clitable.ts";

export const useRFCTime = false;
colors.enable();

export const warn = (message?: string, ...optionalParams: unknown[]): void => {
  console.warn(`Warning: ${message}`, optionalParams);
};

const _outreachSession: TestSession = new OutreachTeamsRaceTestSession();
const _rfidSession: TestSession = new RfidIndividualTestRace();
const apicalSession: TestSession = new ApicalTestRace();

const eventSession: TestSession = apicalSession; // rfidSession;
await eventSession.loadTestData(false);

const filter = (data: ParticipantPassingRecord): boolean => {
  if (!data.participantId) {
    return true;
  }
  const participant = eventSession.getParticipantById(data.participantId);
  if (!participant?.categoryId) {
    return true;
  }
  const participantCategory = eventSession.getCategoryById(participant?.categoryId);
  if (participantCategory?.name === undefined || participantCategory?.name == 'No Category') {
    warn(`Participant ${participant?.firstname} ${participant?.surname} has no category`);
    return false;
  }
  return true;
};

console.log(getCliTable(eventSession, filter).toString());



