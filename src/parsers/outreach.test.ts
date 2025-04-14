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

describe('parseOutreachLine', () => {
  it('Should parse a valid line', async () => {
    const testLines = [
      '2,200306,200306,"25-08-2023 19:11:06.405"',
      '200306\t25-08-2023 19:11:06.405',
    ];

    testLines.forEach(async (line) => {
      const parsed: ChipCrossingData = parseOutreachLine(line);
      // parsed.forEach((parsedData: ChipCrossingData[]) => {
        expect(parsed).toBeDefined();
        expect(parsed.chipCode).toBe(200306);
        expect(parsed.time).toBeDefined();
        expect(parsed.time?.getUTCFullYear()).toBe(2023);
    });
      // expect(parsed?.antenna).toBe(2);
      // expect(parsed?.chipCode).toBe(200306);
      // expect(parsed?.time).toBeDefined();
  });
});

describe('parseSimpleOutreachChipLine', () => {
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

