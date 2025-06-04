import { fromRfidTimingLine, matchRfidLine } from "./rfidtiming.ts";

describe('matchRfidLine', () => {
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

    const time = parts!.groups!.timeString;
    expect(time).toEqual('23-06-2023 19:09:05.202');
  });

  it('Should parse a line with a backwards date format', () => {
    const line = '3,200306,200306,23-06-2023 19:09:05.202';
    const parts: RegExpMatchArray | null = matchRfidLine(line);
    expect(parts, `Line could not be parsed as RFID data: ${line}`).not.toBeNull();
    expect(parts!.groups, `Line could not be parsed as RFID data: ${line}`).not.toBeNull();

    const time = parts!.groups!.timeString;
    expect(time).toEqual('23-06-2023 19:09:05.202');
  });

});

describe('fromRfidTimingLine', () => {
  it ('Should parse a line with a backwards date format', () => {
    const line = '3,100306,187D2,23-06-2023 19:09:05.202';
    const rfidCrossing = fromRfidTimingLine(line);
    expect(rfidCrossing?.chipCode, `Got ${rfidCrossing}`).toEqual(100306);
    expect(rfidCrossing?.antenna).toEqual(3);
    expect(rfidCrossing?.timeString).toEqual('23-06-2023 19:09:05.202');
  });

  it ('Should parse a line with a quoted date', () => {
    const line = '3,200307,30E73,"23-06-2023 19:09:05.202"';
    const rfidCrossing = fromRfidTimingLine(line);
    expect(rfidCrossing?.chipCode).toEqual(200307);
    expect(rfidCrossing?.antenna).toEqual(3);
    expect(rfidCrossing?.timeString).toEqual('23-06-2023 19:09:05.202');
  });

  it ('Should parse a line with a time only', () => {
    const line = '3,300308,49514,19:09:05.202';
    const rfidCrossing = fromRfidTimingLine(line);
    expect(rfidCrossing?.chipCode).toEqual(300308);
    expect(rfidCrossing?.antenna).toEqual(3);
    expect(rfidCrossing?.timeString).toEqual('19:09:05.202');
  });
});
