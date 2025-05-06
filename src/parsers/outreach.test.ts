import { parseFile, parseOutreachLine, parseSimpleOutreachChipLine } from "./outreach.js";

import type { ChipCrossingData } from "../model/chipcrossing.js";
import path from 'node:path';

// import fs from 'node:fs';



const testdata_dir = path.resolve(path.join('.', 'src', 'testdata'));

describe('Read in a full outreach file', () => {
  it('should parse the file correctly', async () => {
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
    expect(data.length).toBe(100);
  });
});

describe('parsers/parseOutreachLine', () => {
  const rfidTimingDataLine = '2,200306,200306,"25-08-2023 19:11:06.405"';
  const outreachTabDelimitedLine = '200306\t25-08-2023 19:11:06.405';
  const outreachCommaDelimitedLineWithDate = '3,200306,200306,23-06-2023 19:09:05.202';
  const outreachCommaDelimitedLineWithoutDate = '2,200455,200455,23-06-2023 14:24:34.542';

  // (?<date>(\d{4}[\-/]\d{1,2}[\-/]\d{1,2})|mm/dd/yyyy)?[\sT])
  // const dateTimeRegex = /(?<date>\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/-]\d{1,2}[\/-]\d{4})[ T](?<time>\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)/;

  it('Should parse a line split with tabs', () => {
    let parsed: ChipCrossingData;
    expect(() => {
      parsed = parseOutreachLine(outreachTabDelimitedLine);
    }).not.toThrowError();
    expect(parsed!).toBeDefined();
    parsed = parsed!;
    expect(parsed.time).toBeDefined();
    expect(parsed.chipCode).toEqual(200306);
  });

  it('Should parse a valid line with a date', async () => {
    const testLines = [
      rfidTimingDataLine,
      outreachTabDelimitedLine,
      outreachCommaDelimitedLineWithDate,
    ];

    testLines.forEach(async (line) => {
      const parsed: ChipCrossingData = parseOutreachLine(line);
      // parsed.forEach((parsedData: ChipCrossingData[]) => {
      expect(parsed).toBeDefined();
      expect(parsed.chipCode).toEqual(200306);
      expect(parsed.time).toBeDefined();
      expect(parsed.time?.getUTCFullYear(), `Year for line '${line}' was not as expected - should be 2023 from parsed value ${parsed.time}.`).toEqual(2023);
    });
    // expect(parsed?.antenna).toBe(2);
    // expect(parsed?.chipCode).toBe(200306);
    // expect(parsed?.time).toBeDefined();
  });

  it ('Should parse a line with only a time value and no date hint provided', () => {
    const testLines = [
      '4,200455,200455,"17:59:56.568',
      outreachCommaDelimitedLineWithoutDate,
    ];

    const expectations = [{
      "hour": 17,
      "millisecond": 568,
      "minute": 59,
      "second": 56,
    },
    {
      "hour": 14,
      "millisecond": 542,
      "minute": 24,
      "second": 34,
    }];

    const currentDate = new Date();

    testLines.forEach(async (line) => {
      const parsed: ChipCrossingData = parseOutreachLine(line);
      // parsed.forEach((parsedData: ChipCrossingData[]) => {
      expect(parsed).toBeDefined();
      expect(parsed.chipCode).toBe(200455);

      expect(parsed.time).toBeDefined();
      expect(parsed.time?.getUTCFullYear()).toEqual(currentDate.getUTCFullYear());
      expect(parsed.time?.getUTCMonth()).toEqual(currentDate.getUTCMonth());
      expect(parsed.time?.getUTCDate()).toEqual(currentDate.getUTCDate());

      expect(parsed.time?.getHours()).toEqual(expectations[0].hour);
      expect(parsed.time?.getMinutes()).toEqual(expectations[0].minute);
      expect(parsed.time?.getSeconds()).toEqual(expectations[0].second);
      expect(parsed.time?.getMilliseconds()).toEqual(expectations[0].millisecond);
    });
  });
});

describe('parsers/parseSimpleOutreachChipLine', () => {
  it('Should parse a valid line', () => {
    const testLines = [
      "200306 25-08-2023 19:11:06.405",
    ];

    testLines.forEach((line) => {
      const parsed: ChipCrossingData = parseSimpleOutreachChipLine(line);
      expect(parsed).toBeDefined();
      expect(parsed.chipCode).toBe(200306);
      expect(parsed.time).toBeDefined();
      expect(parsed.time?.getUTCFullYear()).toBe(2023);
    });
  });
});

