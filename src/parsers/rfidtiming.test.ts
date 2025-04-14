import { matchRfidLine } from "./rfidtiming.js";

describe('Line formats', () => {
  it('Should allow various formats', () => {
    let lines: string[] = [
      '4,200060,200060,"17:48:33.980"',
    ];

    lines.forEach((line) => {
      const parts = matchRfidLine(line);
      expect(parts, `Line could not be parsed as RFID data: ${line}`).not.toBeNull();
    });
  })
});
