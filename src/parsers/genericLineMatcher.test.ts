import { describe, expect, it } from 'vitest';

import { TZDate } from '@date-fns/tz';
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
