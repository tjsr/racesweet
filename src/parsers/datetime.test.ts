import { describe, expect, it } from "vitest";
import { hasDateAndTime, hasDateComponent, parseUnknownDateTimeString } from "./datetime.js";

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

  it ('Should return true for valid date strings split with a space', () => {
    const testInput = '2023-10-01 12:00:00';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });
  it ('Should return true for valid date strings split with a T marker', () => {
    const testInput = '2023-10-01T12:00:00';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });

  it('Should accept dates in reverse order', () => {
    const testInput = '25-08-2023 19:11:06.405';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });

  it('Should accept dates with slashes', () => {
    const testInput = '25/08/2023 19:11:06.405';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });

  it('Should accept dates with slashes and no leading zero on month.', () => {
    const testInput = '25/7/2023 19:11:06.405';
    expect(hasDateAndTime(testInput)).toEqual(true);
  });
});

describe('hasDateComponent', () => {
  const valuesWithDatesFirst = [
    '2023-10-01 12:00:00',
    '2023-10-01T12:00:00',
    '25-08-2023 19:11:06.405',
    '25/08/2023 19:11:06.405',
    '25/7/2023 19:11:06.405',
    '2024-10-26T09:06:25.888',
    '2024-08-17T10:30:33.735',
    '2025-03-01T11:11:45.451',
  ];

  const valuesWithDatesLast = [
    '12:00:00 2023-10-01',
    '11:02:12 2023/08/01',
    '10:27:16 10/11/2024',
    '19:11:06.405 25-08-2023',
    '19:11:06.405 25/08/2023',
    '19:11:06.405 25/7/2023',
    '09:06:25.888 2024-10-26',
    '10:30:33.735 2024-08-17',
    '11:11:45.451 2025-03-01',
  ];

  const timeOnlyValues = [
    '19:21:17.533',
    '12:00:00',
    '11:02:12',
    '10:27:16',
    '19:11:06.405',
    '09:06:25.888',
    '10:30:33.735',
    '11:11:45.451',
  ];

  it('Should return false is a string is provided with no date', () => {
    const testInput = '19:21:17.533';
    expect(hasDateComponent(testInput)).toEqual(false);
  });

  it('Should correctly confirm a date is found in a string', () => {
    const input = '26/10/2024 09:06:25.888';
    const result = hasDateComponent(input);
    expect(result).toEqual(true);
  });

  it ('Should return true on all known variants that have a date and time', () => {
    valuesWithDatesFirst.forEach((testInput) => {
      expect(hasDateComponent(testInput)).toEqual(true);
    });

    valuesWithDatesLast.forEach((testInput) => {
      expect(hasDateComponent(testInput)).toEqual(true);
    });
  });

  it ('Should return false on all known variants that have a time only', () => {
    timeOnlyValues.forEach((testInput) => {
      expect(hasDateComponent(testInput)).toEqual(false);
    });
  });
});

describe('parseUnknownDateTimeString', () => {
  it.skip ('Should return a date object for a valid date-time string with space', () => {
    const testInput = '2023-10-01 12:00:00';
    const result = parseUnknownDateTimeString(testInput);
    expect(result).not.toBeUndefined();
    // expect(result.date).toEqual('2023-10-01');
    // expect(result.time).toEqual('12:00:00');
  });

  it.skip ('Should return a date object for a valid date-time string with T-separator', () => {
    const testInput = '2023-10-01T12:00:00';
    const result = parseUnknownDateTimeString(testInput);
    expect(result.toISOString()).toEqual('2023-10-01');
    // expect(result.date).toEqual('2023-10-01');
    // expect(result.time).toEqual('12:00:00');
  });

  it ('Should return a date object for a valid date-time string with T-separator and UTC offset', () => {
    const testInput = '2023-10-01T12:00:00+11:00';
    const result: Date = parseUnknownDateTimeString(testInput);
    expect(result.toISOString()).toEqual('2023-10-01T01:00:00.000+11:00');
  });

  it ('Should return a date object for a valid T-separated with reversed dmy format', () => {
    const testInput = '10-07-2022T14:15:16';
    const result = parseUnknownDateTimeString(testInput);
    expect(result.toISOString()).toEqual('2022-07-10T14:15:16.000');
  });

  it ('Should return a date object for a valid date-time string with reversed dmy format', () => {
    const testInput = '10-07-2021 14:15:16';
    const result = parseUnknownDateTimeString(testInput);
    expect(result).not.toBeUndefined();
    expect(result.toISOString()).toEqual('2021-07-10T14:15:16.000+1100');
  });
});
