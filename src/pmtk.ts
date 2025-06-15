// const dbFile = process.argv[2];
// const password = process.argv[3];

import { getConnection } from "./controllers/access.ts";
import { getEvent } from "./controllers/pmtk.ts";
import { v5 as uuidv5 } from "uuid";

process.loadEnvFile('.env.tjsr-yoga');

export const dbFile = process.env.GMBC_MDB_FILE || 'C:\\Users\\tim\\OneDrive\\timing-mtb\\GMBC Timing\\No Frills\\GMBCTK.mdb';
const password = process.env.GMBC_MDB_PASSWORD || undefined;

export const conn = getConnection(dbFile, password);
export const eventId = process.env.GMBC_MDB_EVENT_ID ? parseInt(process.env.GMBC_MDB_EVENT_ID, 10) : 211;

const sourceUuid = uuidv5(dbFile, uuidv5.URL);

getEvent(conn, eventId, sourceUuid).then((data) => {
  console.log(data);
});

