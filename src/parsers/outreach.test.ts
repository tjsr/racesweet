import { parseFile, parseOutreachLine } from "./outreach.js";

// import fs from 'node:fs';
import type { ChipCrossingData } from "../model/chipcrossing.js";
import path from 'node:path';

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
    ];

    testLines.forEach(async (line) => {
      const parsed: Promise<ChipCrossingData[]> = parseOutreachLine(line);
      parsed.then((parsedData: ChipCrossingData[]) => {
        expect(parsedData[0].chipCode).toBe(200306);
        expect(parsedData[0].time).toBeDefined();
        expect(parsedData[0].time?.getUTCFullYear()).toBe(2023);
      });
      expect(parsed).toBeDefined();
      // expect(parsed?.antenna).toBe(2);
      // expect(parsed?.chipCode).toBe(200306);
      // expect(parsed?.time).toBeDefined();
    });
  });
});
