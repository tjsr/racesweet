import { DateParseError } from "./errors.js";
import { parseDateString } from "./datestring.js";
import { parseSlashedDateString } from "./slashedDateString.js";

const expectDate = (date: Date, year: number, month: number, day: number) => {
  const valueYear = date.getFullYear();
  expect(valueYear, `Year ${valueYear} did not match expected year ${year}`).toEqual(year);
  expect(date.getMonth()).toEqual(month-1);
  expect(date.getDate()).toEqual(day);
};

describe('parseSlashedDateString::parseDateString', () => {
  it('Should accept a fairly human-readable slashed date', () => {
    const testString = '26/10/2024';
    const result = parseDateString(testString);
    expect(result.toISOString()).toContain('2024-10-26');
  });

  it('Should reject human-readable slashed date that provides a time.', () => {
    const testString = '26/10/2024 09:06:25.888';
    expect(() => parseDateString(testString)).toThrow(DateParseError);
  });
});

describe('slashedDateString', () => {
  it('parses 4-digit year with slash', () => {
    const result = parseSlashedDateString('12/25/2020');
    expect(result.toISOString()).toContain('2020-12-25');
    expectDate(result, 2020, 12, 25);
  });

  it('Reject parses 2-digit year with slash when outside valid range', () => {
    expect(() => parseSlashedDateString('12/25/49')).toThrow(DateParseError);
  });

  it('parses 2-digit year above 49 as 1900s for valid years', () => {
    const result = parseSlashedDateString('12/25/72');
    expect(result.toISOString()).toContain('1972-12-25');
    expectDate(result, 1972, 12, 25);
  });

  it('Reject parses 2-digit year between 37 and 70 despite 1900s', () => {
    expect(() => parseSlashedDateString('12/25/37')).toThrow(DateParseError);
  });

  it('parses 2-digit year at lower bound (00)', () => {
    const result = parseSlashedDateString('12/25/00');
    expect(result.toISOString()).toContain('2000-12-25');
    expectDate(result, 2000, 12, 25);
  });

  it('Should reject invalid date formats', () => {
    const invalidDates = [
      '12/25/2020/01',
      '12-25-2020',
      '2020-12-25',
      '2020/12/25',
      '12/25/20a0',
      '12/25/20.0',
      '12/25/20,0',
      '12/25/20 0',
      '12/25/20 00',
    ];

    invalidDates.forEach((date) => {
      expect(() => parseSlashedDateString(date)).toThrow(DateParseError);
    });
  });
});
