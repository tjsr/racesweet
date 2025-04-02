import { describe, expect, it } from "vitest";

import { parseableDateTimeStrings } from "./parseableDateTimeStrings.js";
import { splitDateTime } from "./datetime.js";

describe("splitDateTime", () => {
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
      "random text",
      "2023/02/30",
    ];

    invalidInputs.forEach((input) => {
      expect(() => splitDateTime(input)).toThrowError(
        `Invalid date/time format: ${input}`
      );
    });
  });
});