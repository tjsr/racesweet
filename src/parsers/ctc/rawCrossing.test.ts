import { parseCtcRawCrossingFile, parseCtcRawCrossingLine, splitCtcRawCrossingLines } from './rawCrossing.js';

describe('CTC raw crossing parser', () => {
  it('splits SRT and ERF raw records on carriage-return style line breaks', () => {
    expect(splitCtcRawCrossingLines('040000000010000012340302064000\r040000000020000056780101063016\r\n')).toEqual([
      '040000000010000012340302064000',
      '040000000020000056780101063016',
    ]);
  });

  it('parses the compact CTC timing record layout from SRT files', () => {
    expect(parseCtcRawCrossingLine('040000000010000012340302064000', 7)).toEqual({
      confidence: '064',
      drtCode: '04',
      laneNumber: 2,
      lineNumber: 3,
      raw: '040000000010000012340302064000',
      rawTimeTicks: 100000,
      recordNumber: 7,
      status: '000',
      transmitter: 1234,
    });
  });

  it('parses multiple ERF records and skips malformed lines', () => {
    expect(parseCtcRawCrossingFile(Buffer.from('bad\r040000000020000056780101063016', 'latin1'))).toEqual([
      {
        confidence: '063',
        drtCode: '04',
        laneNumber: 1,
        lineNumber: 1,
        raw: '040000000020000056780101063016',
        rawTimeTicks: 200000,
        recordNumber: 2,
        status: '016',
        transmitter: 5678,
      },
    ]);
  });
});
