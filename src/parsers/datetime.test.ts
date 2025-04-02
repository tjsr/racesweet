import { describe, expect, it } from "vitest";
import { hasDateAndTime, splitDateTime } from "./datetime.js";

import { parseableDateTimeStrings } from "./parseableDateTimeStrings.js";

describe('hasDateAndTime', () => {
  it('Should match for string with a T separator', () => {
    const testInput = '2023-10-01T12:00:00';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });

  it('Should match for string with a space separator', () => {
    const testInput = '2023-10-01 12:00:00';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });

  it('Should not match for string with no separator', () => {
    const invalidInputs = [
      '20231001120000',
      '2023-10-01X120000',
      '10:19:17.533',
    ];
    invalidInputs.forEach((testInput) => {
      expect(hasDateAndTime(testInput)).toEqual(false);
    });
  });
});

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
      expect(result.date).toEqual(date);
      expect(result.time).toEqual(time);
    });
  });

  it('should reject empty input values', () => {
    const emptyInputs = [
      undefined,
      null,
      ""
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