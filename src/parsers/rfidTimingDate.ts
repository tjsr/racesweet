import { DateParseError } from './errors.ts';
import { parse } from 'date-fns';

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

export const tryParseDateTime = (dateString: string, refDate: Date): Date | null => {
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
