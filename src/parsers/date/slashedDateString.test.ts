import { DateParseError } from "./errors.ts";
import { expectDate } from "./dateTestUtils.ts";
import { expectParseString } from "./datestring.test.ts";
import { parseDateString } from "./datestring.ts";
import { parseSlashedDateString } from "./slashedDateString.js";

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

const expectParsedSlashString = (dateString: string, year: number, month: number, day: number) => {
  const result = parseSlashedDateString(dateString);
  expectDate(result, year, month, day);
};


const expectInvalid = (inputString: string) => {
  expect(() => parseSlashedDateString(inputString)).toThrow(DateParseError);
};

describe('slashedDateString', () => {
  it('Rejects any date with day in the middle', () => {
    expectInvalid('12/25/2020');
  });

  it('parses 4-digit year with slash', () => {
    expectParsedSlashString('25/12/2020', 2020, 12, 25);
  });

  it('parses 2-digit year at lower bound (00)', () => {
    expectParseString('25/12/00', 2000, 12, 25);
  });

  it('Reject parses 2-digit year with slash when outside valid range', () => {
    expect(() => parseSlashedDateString('25/12/49')).toThrow(DateParseError);
  });

  it('parses 2-digit year above 49 as 1900s for valid years', () => {
    expectParsedSlashString('25/12/72', 1972, 12, 25);
  });

  it('Reject parses 2-digit year between 37 and 70 despite 1900s', () => {
    expect(() => parseSlashedDateString('25/12/37')).toThrow(DateParseError);
  });

  it('parses 2-digit year at lower bound (00)', () => {
    const result = parseSlashedDateString('25/12/00');
    expect(result.toISOString()).toContain('2000-12-25');
    expectDate(result, 2000, 12, 25);
  });

  it('Should reject invalid date formats', () => {
    const invalidDates = [
      '12/25/2020/01',
      // '12-25-2020',
      // '2020-12-25',
      // '2020/12/25',
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
