import { parseCtcRawCrossingFile, parseCtcRawCrossingLine, splitCtcRawCrossingLines } from './rawCrossing.js';

describe('CTC raw crossing parser', () => {
  it('splits SRT and ERF raw records on carriage-return style line breaks', () => {
    expect(splitCtcRawCrossingLines('040000000010000012340302064000\r040000000020000056780101063016\r\n')).toEqual([
      '040000000010000012340302064000',
      '040000000020000056780101063016',
    ]);
  });

  it('splits control-delimited legacy raw records into separate preview and import rows', () => {
    expect(splitCtcRawCrossingLines('040000000010000012340302064000\u001e040000000020000056780101063016\u0000')).toEqual([
      '040000000010000012340302064000',
      '040000000020000056780101063016',
    ]);
  });

  it('splits an Electron IPC Uint8Array payload by its carriage-return line boundaries', () => {
    const payload = new Uint8Array(Buffer.from('000675258827810809201206219000000\r000675258828748906501208213000000\r', 'latin1'));

    expect(splitCtcRawCrossingLines(payload)).toEqual([
      '000675258827810809201206219000000',
      '000675258828748906501208213000000',
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

  it('parses the legacy ERF 04 layout with its sequence, status, and error fields', () => {
    expect(parseCtcRawCrossingLine('040787086535631800570206255400002', 4, 'erf')).toEqual(expect.objectContaining({
      absoluteTimeTicks: 7870865356318,
      confidence: '255',
      drtCode: '04',
      errors: 2,
      hitCount: undefined,
      laneNumber: 6,
      lineNumber: 2,
      sequence: 4,
      status: '000',
      transmitter: 57,
    }));
  });

  it('parses INDY500 ERF type-60 Time Machine clock rows separately from crossings', () => {
    expect(parseCtcRawCrossingLine('600675258828590006752588285031 211 11:53:48.5031 00', 1, 'erf')).toEqual(expect.objectContaining({
      absoluteTimeTicks: 6752588285031,
      drtCode: '60',
      rawTimeTicks: 428285031,
      sourceTimestampTicks: 6752588285900,
      status: '00',
      timeMachine: '211',
      timeText: '11:53:48.5031',
    }));
  });

  it('parses INDY500 ERF type-00 crossings with three-digit transmitter and line fields', () => {
    expect(parseCtcRawCrossingLine('000675258827810809201206219000000', 2, 'erf')).toEqual(expect.objectContaining({
      confidence: '219',
      drtCode: '00',
      laneNumber: 6,
      lineNumber: 12,
      secondaryTransmitter: 0,
      status: '000',
      transmitter: 92,
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

  it('parses legacy visible-time SRT records as Time Machine clock rows', () => {
    expect(parseCtcRawCrossingLine('600817997112730008179971116300 071 13:25:11.6300 00', 3)).toEqual(expect.objectContaining({
      drtCode: '60',
      raw: '600817997112730008179971116300 071 13:25:11.6300 00',
      rawTimeTicks: 483116300,
      recordNumber: 3,
      sourceTimestampTicks: 8179971127300,
      status: '00',
      timeMachine: '071',
      timeText: '13:25:11.6300',
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
