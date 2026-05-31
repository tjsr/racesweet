import { parseableDateTimeStrings } from "./parseableDateTimeStrings.js";
import { splitDateTime, timeStringHasTimezone } from "./splitDateTime.js";

describe("splitDateTime", () => {
  it('Should allow a string with a time only, and infer the date as today', () => {
    const testInput = '19:21:17.533';
    expect(() => splitDateTime(testInput)).toThrowError();
    // const splitDate = splitDateTime();
  });

  // it('Should accept certain values', () => {
  //   expect(splitDateTime('...')
  // })

  it("should correctly split valid date-time strings", () => {
    parseableDateTimeStrings.forEach(({ str, date, time }) => {
      const result = splitDateTime(str);
      expect(result.date, `Input string: ${str}`).toEqual(date);
      expect(result.time, `Input string: ${str}`).toEqual(time);
    });
  });

  it ('Should produce a default time value in the UTC timezone', () => {
    const str = '2025-03-01 11:11:45.451';
    const result = splitDateTime(str);

    expect(result.time, `Input string: ${str}`).toEqual('00:11:45.451Z');
  });

  it ('Should produce a specified time value in a set timezone', () => {
    const str = '2025-03-01 11:11:45.451+08:00';
    const result = splitDateTime(str);
    expect(result.time, `Input string: ${str}`).toEqual('03:11:45.451Z');
  });

  it ('Should produce a UTC time value', () => {
    const str = '2025-03-01 11:11:45.451Z';
    const result = splitDateTime(str);
    expect(result.time, `Input string: ${str}`).toEqual('11:11:45.451Z');
  });

  // it ('Should get current tz time.', () => {
  //   dateToRFC3339Local()
  // });

  it('Should accept a fairly human-readable date and time string', () => {
    const testString = '26/10/2024 09:06:25.888';
    const result = splitDateTime(testString);
    expect(result.date).not.toEqual('26/10/2024');
    expect(result.date).toEqual('2024-10-26');
    expect(result.time).toEqual('09:06:25.888');
  });

  it('should reject empty input values', () => {
    const emptyInputs = [
      undefined,
      null,
      "",
    ];

    emptyInputs.forEach((input) => {
      expect(() => splitDateTime(input!)).toThrowError(
        `Input cannot be empty`
      );
    });
  });

  it("should throw an error for invalid date-time strings", () => {
    const invalidInputs = [
      "invalid-date",
      "2023-13-01T25:61",
      "2023-13-01T23:61",
      "2023-13-01T10:61",
      "2023-13-01T10:51",
      "random text",
      // "2023/02/30",
    ];

    invalidInputs.forEach((input) => {
      expect(() => splitDateTime(input), `Input format ${input} was accepted.`).toThrowError();
    });
  });
});

describe("timeStringHasTimezone", () => {
  describe("returns true", () => {
    it.each([
      ["UTC Z suffix on ISO datetime", "2025-03-01T11:11:45.451Z"],
      ["UTC Z suffix on space-separated datetime", "2025-03-01 11:11:45.451Z"],
      ["time-only string with Z", "11:11:45.451Z"],
      ["bare Z character", "Z"],
      ["positive offset on ISO datetime", "2025-03-01T11:11:45.451+08:00"],
      ["positive offset on space-separated datetime", "2025-03-01 11:11:45.451+08:00"],
      ["positive UTC offset +00:00", "2025-03-01T11:11:45.451+00:00"],
      ["time-only with positive offset", "11:11:45.451+08:00"],
      ["negative offset on ISO datetime", "2025-03-01T11:11:45.451-05:00"],
      ["negative offset on space-separated datetime", "2025-03-01 11:11:45.451-05:00"],
      ["time-only with negative offset", "11:11:45.451-05:00"],
      ["bare positive offset string", "+08:00"],
      ["bare negative offset string", "-05:00"],
    ])("%s: %s", (_label, input) => {
      expect(timeStringHasTimezone(input)).toBe(true);
    });
  });

  describe("returns false", () => {
    it.each([
      ["ISO datetime without timezone", "2025-03-01T11:11:45.451"],
      ["space-separated datetime without timezone", "2025-03-01 11:11:45.451"],
      ["time-only string without timezone", "11:11:45.451"],
      ["date-only string", "2025-03-01"],
      ["slashed date with time, no timezone", "26/10/2024 09:06:25.888"],
      ["empty string", ""],
    ])("%s: %s", (_label, input) => {
      expect(timeStringHasTimezone(input)).toBe(false);
    });

    it("returns false for null", () => {
      expect(timeStringHasTimezone(null as unknown as string)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(timeStringHasTimezone(undefined as unknown as string)).toBe(false);
    });
  });
});
