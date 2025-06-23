import { ApicalLocalFile } from './testdata/apicalLocalFile.ts';
import LocalFileResourceProvider from './controllers/resource/local.ts';
import { OutreachTeamsRaceTestSession } from './testdata/outreach.ts';
import type { ParticipantPassingRecord } from './model/timerecord.ts';
import { ResourceProvider } from './controllers/resource/provider.ts';
import { RfidIndividualTestRace } from './testdata/rfid.ts';
import type { TestSession } from './testdata/testsession.ts';
import colors from 'colors';
import { getCliTable } from "./controllers/clitable.ts";
import { warn } from './utils.ts';

colors.enable();

const localFileResourceProvider: ResourceProvider<Buffer> = new LocalFileResourceProvider<Buffer>('src/testdata');
const _outreachSession: TestSession = new OutreachTeamsRaceTestSession(localFileResourceProvider);
const _rfidSession: TestSession = new RfidIndividualTestRace(localFileResourceProvider);
const apicalSession: TestSession = new ApicalLocalFile();

const eventSession: TestSession = apicalSession; // rfidSession;

const filterDisplayedRows = (data: ParticipantPassingRecord): boolean => {
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

eventSession.loadTestData(false).then(() => {
  console.log(getCliTable(eventSession, filterDisplayedRows).toString());
});

