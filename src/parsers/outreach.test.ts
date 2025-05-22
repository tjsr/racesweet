import { parseFile, parseOutreachLine, parseSimpleOutreachChipLine } from "./outreach.js";

import type { UnsourcedOutreachChipCrossingData } from "./outreach.ts";
import path from 'node:path';

const testdata_dir = path.resolve(path.join('.', 'src', 'testdata'));
// const dateHint: TZDate = new TZDate();

const _timeToExpectation = (time: Date) => {
  return {
    "date": time.getUTCDate(),
    "hour": time.getUTCHours(),
    "millisecond": time.getUTCMilliseconds(),
    "minute": time.getUTCMinutes(),
    "month": time.getUTCMonth(),
    "second": time.getUTCSeconds(),
    "year": time.getUTCFullYear(),
  };
};

describe('Read in a full outreach file', () => {
  it('should parse the file correctly', { timeout: 10000 }, async () => {
    const dataFile = '192.168.1.119 2025-03-03.txt';
    let filePath = path.join(testdata_dir, dataFile);
    if (filePath.startsWith('\\')) {
      filePath = filePath.replace(/^\\/, '');
    }
    // const filePath = path.format({
    //   base: '192.168.1.119 2025-03-03.txt',
    //   dir: testdata_dir,
    // });
    console.log(filePath);
    const data = await parseFile(filePath);
    expect(data.length).toBe(23624);
  });
});

describe('parsers/parseOutreachLine', () => {
  // const currentDate = new Date();

  const rfidTimingDataLine = '2,200306,200306,"25-08-2023 19:11:06.405"';
  const outreachTabDelimitedLine = '200306\t25-08-2023 19:11:06.405';
  const outreachCommaDelimitedLineWithDate = '3,200306,200306,23-06-2023 19:09:05.202';
  const outreachCommaDelimitedLineWithoutDate = '2,200455,200455,14:24:34.542';

  // (?<date>(\d{4}[\-/]\d{1,2}[\-/]\d{1,2})|mm/dd/yyyy)?[\sT])
  // const dateTimeRegex = /(?<date>\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})[ T](?<time>\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/;

  it('Should parse a line split with tabs', () => {
    let parsed: UnsourcedOutreachChipCrossingData;
    expect(() => {
      parsed = parseOutreachLine(outreachTabDelimitedLine);
    }).not.toThrowError();
    expect(parsed!).toBeDefined();
    parsed = parsed!;
    expect(parsed.timeString).toBeDefined();
    expect(parsed.chipCode).toEqual(200306);
  });

  it('Should parse a valid line with a date', async () => {
    const testLines = [
      rfidTimingDataLine,
      outreachTabDelimitedLine,
      outreachCommaDelimitedLineWithDate,
    ];

    testLines.forEach(async (line) => {
      const parsed: UnsourcedOutreachChipCrossingData = parseOutreachLine(line);
      // parsed.forEach((parsedData: ChipCrossingData[]) => {
      expect(parsed).toBeDefined();
      expect(parsed.chipCode).toEqual(200306);
      expect(parsed.timeString).toBeDefined();
      // expect(parsed.timeString?.getUTCFullYear(), `Year for line '${line}' was not as expected - should be 2023 from parsed value ${parsed.time}.`).toEqual(2023);
    });
    // expect(parsed?.antenna).toBe(2);
    // expect(parsed?.chipCode).toBe(200306);
    // expect(parsed?.time).toBeDefined();
  });

  it('Should parse a line with a date and time', () => {
    const line = outreachCommaDelimitedLineWithDate;
    // const expectation = {
    //   "date": 23,
    //   "hour": 19,
    //   "millisecond": 202,
    //   "minute": 9,
    //   "month": 5,
    //   "second": 5,
    //   "year": 2023,
    // };

    const parsed: Partial<UnsourcedOutreachChipCrossingData> | UnsourcedOutreachChipCrossingData = parseOutreachLine(line);
    // parsed.forEach((parsedData: ChipCrossingData[]) => {
    expect(parsed).toBeDefined();
    expect(parsed.chipCode).toBe(200306);

    // expect(parsed.timeString).toBeDefined();
    expect(parsed.timeString).toEqual("23-06-2023 19:09:05.202");
    // const result = timeToExpectation(parsed.time!);
    // expect(expectation, `Parsed date and time values do not match expectation for line ${line}`).toEqual(result);
  });

  it('Should parse a line with no date but time', () => {
    const line = outreachCommaDelimitedLineWithoutDate;
    // const expectation = {
    //   "date": currentDate.getUTCDate(),
    //   "hour": 14,
    //   "millisecond": 542,
    //   "minute": 24,
    //   "month": currentDate.getUTCMonth(),
    //   "second": 34,
    //   "year": currentDate.getUTCFullYear(),
    // };

    const parsed: Partial<UnsourcedOutreachChipCrossingData> | UnsourcedOutreachChipCrossingData = parseOutreachLine(line);
    // parsed.forEach((parsedData: ChipCrossingData[]) => {
    expect(parsed).toBeDefined();
    expect(parsed.chipCode).toBe(200455);

    expect(parsed.timeString).toEqual("14:24:34.542");
    expect(parsed.timeString).toBeDefined();
    // const result = timeToExpectation(parsed.time!);
    // expect(expectation, `Parsed date and time values do not match expectation for line ${line}`).toEqual(result);
  });

  it ('Should parse a line with only a time value and no date hint provided', () => {
    const line = '4,200455,200455,"17:59:56.568';

    // const expectation = {
    //   "date": currentDate.getUTCDate(),
    //   "hour": 17,
    //   "millisecond": 568,
    //   "minute": 59,
    //   "month": currentDate.getUTCMonth(),
    //   "second": 56,
    //   "year": currentDate.getUTCFullYear(),
    // };

    const parsed: Partial<UnsourcedOutreachChipCrossingData> | UnsourcedOutreachChipCrossingData = parseOutreachLine(line);
    // parsed.forEach((parsedData: ChipCrossingData[]) => {
    expect(parsed).toBeDefined();
    expect(parsed.chipCode).toBe(200455);

    expect(parsed.timeString).toEqual('17:59:56.568');
    // const result = timeToExpectation(parsed.time!);
    // expect(expectation, `Parsed date and time values do not match expectation for line ${line}`).toEqual(result);

    // expect(parsed.time?.getUTCFullYear(), `Unmatched year in line ${line}`).toEqual(expectation.year);
    // expect(parsed.time?.getUTCMonth(), `Unmatch month in line ${line}`).toEqual(expectation.month);
    // expect(parsed.time?.getUTCDate(), `Unmatched day in line ${line}`).toEqual(expectation.date);

    // expect(parsed.time?.getHours(), `Unmatched hours in line ${line}`).toEqual(expectation.hour);
    // expect(parsed.time?.getMinutes(), `Unmatched minutes in line ${line}`).toEqual(expectation.minute);
    // expect(parsed.time?.getSeconds(), `Unmatched seconds in line ${line}`).toEqual(expectation.second);
    // expect(parsed.time?.getMilliseconds(), `Unmatched milliseconds in line ${line}`).toEqual(expectation.millisecond);
  });
});

describe('parsers/parseSimpleOutreachChipLine', () => {
  it('Should parse a valid line', () => {
    const testLines = [
      "200306 25-08-2023 19:11:06.405",
    ];

    testLines.forEach((line) => {
      const parsed: UnsourcedOutreachChipCrossingData = parseSimpleOutreachChipLine(line);
      expect(parsed).toBeDefined();
      expect(parsed.chipCode).toBe(200306);
      expect(parsed.timeString).toEqual("25-08-2023 19:11:06.405");
    });
  });
});

