import { describe, expect, it } from 'vitest';

import { TZDate, tz } from '@date-fns/tz';
import { formatRFC3339 } from 'date-fns';
import { parseDateTime } from "./genericLineMatcher.js";

describe('parseDateTime', () => {
  const msTimeFormat = 'HH:mm:ss.SSS';
  it('Should parse a time only', () => {
    const dateHint = new TZDate();
    const chipLine = '1245,19:11:06.405';
    const parsed: Date = parseDateTime(chipLine, dateHint, msTimeFormat);

    const dateNow = new Date();
    expect(parsed).toBeDefined();
    expect(parsed.getUTCFullYear()).toBe(dateNow.getFullYear());
    expect(parsed.getUTCHours()).toBe(19);
    expect(parsed.getUTCMinutes()).toBe(11);
    expect(parsed.getUTCSeconds()).toBe(6);
    expect(parsed.getUTCMilliseconds()).toBe(405);
  });

  it('Should parse a time with a date hint', () => {
    const dateHint = new TZDate('2023-08-25');
    const chipLine = '1245,19:11:06.405';
    const parsed: Date = parseDateTime(chipLine, dateHint, msTimeFormat);
    expect(parsed).toBeDefined();
    expect(parsed.getUTCFullYear()).toBe(dateHint.getUTCFullYear());
    expect(parsed.getUTCMonth()).toBe(dateHint.getUTCMonth());
    expect(parsed.getUTCDate()).toBe(dateHint.getUTCDate());
    expect(parsed.getUTCHours()).toBe(19);
    expect(parsed.getUTCMinutes()).toBe(11);
    expect(parsed.getUTCSeconds()).toBe(6);
    expect(parsed.getUTCMilliseconds()).toBe(405);
  });
  it('should parse using system timezone when dateHint has no timeZone set', () => {
    const systemTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dateHint = new TZDate(2023, 9, 1);
    expect(dateHint.timeZone).toBeUndefined();

    const result = parseDateTime('2023-10-01T14:30:00', dateHint);

    const formatted = formatRFC3339(result, { fractionDigits: 3, in: tz(systemTz) });
    expect(formatted).toMatch(/^2023-10-01T14:30:00\.000/);
  });

  it('should parse using dateHint timeZone when dateHint has a known timeZone', () => {
    const dateHint = new TZDate(new Date('2023-10-01T00:00:00Z'), 'America/New_York');
    expect(dateHint.timeZone).toBe('America/New_York');

    const result = parseDateTime('2023-10-01T12:00:00', dateHint);

    const formatted = formatRFC3339(result, { fractionDigits: 3, in: tz('America/New_York') });
    expect(formatted).toEqual('2023-10-01T12:00:00.000-04:00');
  });
});

// describe('parseLineMatching', () => {
//   const testLines = [
//     "200306 25-08-2023 19:11:06.405",
//   ];
//   it('Should parse all given lines', () => {
//     testLines.forEach((line) => {
//       parseLineMatching(line, )

//     });
//   });
// });
