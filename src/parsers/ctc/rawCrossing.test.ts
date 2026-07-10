import { parseCtcRawCrossingFile, parseCtcRawCrossingLine, splitCtcRawCrossingLines } from './rawCrossing.js';

describe('CTC raw crossing parser', () => {
  it('splits SRT and ERF raw records on carriage-return style line breaks', () => {
    expect(splitCtcRawCrossingLines('040000000010000012340302064000\r040000000020000056780101063016\r\n')).toEqual([
      '040000000010000012340302064000',
      '040000000020000056780101063016',
    ]);
  });

  it('parses the compact CTC timing record layout from SRT files', () => {
    expect(parseCtcRawCrossingLine('040000000010000012340302064000', 7)).toEqual(expect.objectContaining({
      absoluteTimeTicks: 100000,
      confidence: '064',
      drtCode: '04',
      laneNumber: 2,
      lineNumber: 3,
      raw: '040000000010000012340302064000',
      rawTimeTicks: 100000,
      recordNumber: 7,
      status: '000',
      transmitter: 1234,
    }));
  });

  it('parses multiple ERF records and skips malformed lines', () => {
    expect(parseCtcRawCrossingFile(Buffer.from('bad\r040000000020000056780101063016', 'latin1'))).toEqual([
      expect.objectContaining({
        absoluteTimeTicks: 200000,
        confidence: '063',
        drtCode: '04',
        laneNumber: 1,
        lineNumber: 1,
        raw: '040000000020000056780101063016',
        rawTimeTicks: 200000,
        recordNumber: 2,
        status: '016',
        transmitter: 5678,
      }),
    ]);
  });

  it('parses legacy visible-time SRT records as authoritative time-of-day rows', () => {
    expect(parseCtcRawCrossingLine('600817997112730008179971116300 071 13:25:11.6300 00', 3)).toEqual(expect.objectContaining({
      drtCode: 'SRT',
      raw: '600817997112730008179971116300 071 13:25:11.6300 00',
      rawTimeTicks: 483116300,
      recordNumber: 3,
      status: '00',
      timeText: '13:25:11.6300',
      transmitter: 6008,
    }));
  });

  it('derives authoritative time-of-day values for compact records from visible-time SRT rows', () => {
    expect(parseCtcRawCrossingFile([
      '600881437728440008814377286801 021 19:48:48.6801 00',
      '040881438149697001300108255000002',
      '4008814385499814',
      '4D08814381718986',
      '4E08814384245260',
    ].join('\r'))).toEqual([
      expect.objectContaining({
        absoluteTimeTicks: 8814377286801,
        rawTimeTicks: 713286801,
        timeText: '19:48:48.6801',
      }),
      expect.objectContaining({
        drtCode: '04',
        hitCount: 2,
        rawTimeTicks: 717496970,
        timeText: '19:55:49.6970',
        transmitter: 130,
      }),
      expect.objectContaining({
        drtCode: '40',
        specialType: 'start-of-race',
        timeText: '20:02:29.9814',
      }),
      expect.objectContaining({
        drtCode: '4D',
        specialType: 'yellow-flag',
        timeText: '19:56:11.8986',
      }),
      expect.objectContaining({
        drtCode: '4E',
        specialType: 'yellow-end',
        timeText: '20:00:24.5260',
      }),
    ]);
  });
});
