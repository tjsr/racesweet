import { matchRfidLine } from "./rfidtiming.js";

describe('Line formats', () => {
  it('Should allow various formats', () => {
    const lines: string[] = [
      '4,200060,200060,"17:48:33.980"',
      '2,200306,200306,"25-08-2023 19:11:06.405"',
    ];

    lines.forEach((line) => {
      const parts = matchRfidLine(line);
      expect(parts, `Line could not be parsed as RFID data: ${line}`).not.toBeNull();
    });
  });

  it('Should parse a line with a backwards date format', () => {
    const line = '3,200306,200306,23-06-2023 19:09:05.202';
    const parts: RegExpMatchArray | null = matchRfidLine(line);
    expect(parts, `Line could not be parsed as RFID data: ${line}`).not.toBeNull();
    expect(parts!.groups, `Line could not be parsed as RFID data: ${line}`).not.toBeNull();
    const time = parts!.groups!.time;

    expect(time).toBeDefined();
    expect(time).toEqual('23-06-2023 19:09:05.202');
  });
});
