import { parseDateTime, parseLineMatching } from "./genericLineMatcher.js";

describe('parseDateTime', () => {
  it('Should parse a time only', () => {
    const chipLine = '1245,19:11:06.405';
    const dateTimeFormat = 'HH:mm:ss.SSS';
    const parsed: Date = parseDateTime(chipLine, dateTimeFormat);


    const dateNow = new Date();
    expect(parsed).toBeDefined();
    expect(parsed.getUTCFullYear()).toBe(dateNow.getFullYear());
    expect(parsed.getUTCHours()).toBe(19);
    expect(parsed.getUTCMinutes()).toBe(11);
    expect(parsed.getUTCSeconds()).toBe(6);
    expect(parsed.getUTCMilliseconds()).toBe(405);
  });

  it('Should parse a time with a date hint', () => {
    const dateHint = new Date('2023-08-25');
    const chipLine = '1245,19:11:06.405';
    const dateTimeFormat = 'HH:mm:ss.SSS';
    const parsed: Date = parseDateTime(chipLine, dateTimeFormat, undefined, dateHint);
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