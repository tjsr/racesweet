// const dbFile = process.argv[2];
// const password = process.argv[3];

import { getConnection } from "./controllers/access.ts";
import { getEvent } from "./controllers/pmtk.ts";
import { v5 as uuidv5 } from "uuid";

export const dbFile = 'C:\\Users\\tim\\OneDrive\\timing-mtb\\GMBC Timing\\No Frills\\GMBCTK.mdb';
const password = undefined;
export const conn = getConnection(dbFile, password);
export const eventId = 211;

const sourceUuid = uuidv5(dbFile, uuidv5.URL);

const data = await getEvent(conn, eventId, sourceUuid);

console.log(data);

