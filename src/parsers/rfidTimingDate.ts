import { DateParseError } from './date/errors.ts';
import type { TZDate } from '@date-fns/tz';
import { parse } from 'date-fns';
import { parseUnknownDateTimeString } from './date/datetime.ts';

const knownDateFormats = [
  'dd/MM/yyyy',
  'MM/dd/yyyy',
  'yyyy/MM/dd',
  'dd-MM-yyyy',
  'MM-dd-yyyy',
  'yyyy-MM-dd',
  '',
];

const timeFormat  = 'HH:mm:ss.SSS';

export const tryParseDateTime = (dateString: string, refDate: TZDate): Date | null => {
  const parsed = parseUnknownDateTimeString(dateString, refDate);
  if (parsed !== null) {
    return parsed;
  }
  throw new DateParseError(`Invalid date format: ${dateString}`);

  // RefDate is required because it gives us the timezone if not provided.
  for (const format of knownDateFormats) {
    const parseFormat = `${format} ${timeFormat}`.trim();
    try {
      const parsedDate = parse(dateString, format, refDate);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate;
      }
    } catch (error) {
      console.debug(`Couldn't parse date string "${dateString}" with format "${parseFormat}": ${error}`);
    }
  }
  throw new DateParseError(`Invalid date format: ${dateString}`);
};
