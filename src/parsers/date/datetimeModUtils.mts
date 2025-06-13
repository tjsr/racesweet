import * as adp from 'any-date-parser';

import { DateParseError } from "./errors.js";
import { TZDate } from "@date-fns/tz";

export const anyDateParseUnknownDateTimeString = (input: string): TZDate => {
  const date = adp.fromString(input);
  if (date !== null) {
    return new TZDate(date);
  }

  throw new DateParseError('Date value could not be parsed.', input);
};
