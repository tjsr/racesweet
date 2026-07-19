import { existsSync, readFileSync } from 'node:fs';
import { findCtcTrackLineName, findCtcTrackLoopBySiteAddress, getCtcFinishLineNumbers } from '../../model/ctcTrackConfig.js';
import type { CtcTrackConfig } from '../../model/ctcTrackConfig.js';
import { parseCtcTrackConfig } from './trackConfig.js';

const withoutLapCompletionFlags = (trackConfig: CtcTrackConfig): CtcTrackConfig => ({
  ...trackConfig,
  networks: trackConfig.networks.map((network) => ({
    ...network,
    lines: network.lines.map((line) => ({
      ...line,
      loops: line.loops.map(({ isLapCompletion: _isLapCompletion, ...loop }) => loop),
    })),
  })),
});

describe('CTC TRACK.CFG parsing', () => {
  it('extracts network line descriptions from comments above A records', () => {
    const trackConfig = parseCtcTrackConfig([
      '#***************** Pit Exit : Pits ************ South Network *****#',
      'A     35     1       2               5,1     5,2     5,3     5,4',
      'A     35     2       2               5,5     5,6     5,7     5,8',
      'A     35     3       2               5,9     5,10    5,11    5,12',
    ].join('\r\n'), 'C:/timing/TRACK.CFG');

    expect(trackConfig.filePath).toBe('C:/timing/TRACK.CFG');
    expect(withoutLapCompletionFlags(trackConfig).networks).toEqual([{
      lines: [{
        line: 5,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 35 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 35 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 35 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 35 },
          { card: 2, comPort: 2, loopNumber: 5, siteAddress: 35 },
          { card: 2, comPort: 2, loopNumber: 6, siteAddress: 35 },
          { card: 2, comPort: 2, loopNumber: 7, siteAddress: 35 },
          { card: 2, comPort: 2, loopNumber: 8, siteAddress: 35 },
          { card: 3, comPort: 2, loopNumber: 9, siteAddress: 35 },
          { card: 3, comPort: 2, loopNumber: 10, siteAddress: 35 },
          { card: 3, comPort: 2, loopNumber: 11, siteAddress: 35 },
          { card: 3, comPort: 2, loopNumber: 12, siteAddress: 35 },
        ],
        name: 'Pit Exit : Pits',
      }],
      name: 'South Network',
    }]);
    expect(findCtcTrackLineName(trackConfig, 5, 8)).toBe('Pit Exit : Pits');
  });

  it('identifies three or more named loop sets by line, loop, site, card, and com port', () => {
    const trackConfig = parseCtcTrackConfig([
      '#***************** Start/Finish : Track ******* North Network *****#',
      'A     31     1       2               1,1     1,2     1,3     1,4',
      'A     31     2       2               1,5     1,6     1,7     1,8',
      'A     31     3       2               1,9     1,10    1,11    1,12',
      '#***************** Speed Trap : Track ********* South Network *****#',
      'A     33     1       2               3,1     3,2     3,3     3,4',
      '#***************** Pit Entry : Pits *********** North Network *****#',
      'A     34     1       2               4,1     4,2     4,3     4,4',
      '#***************** Start/Finish : Pits ******** North Network *****#',
      'A     32     1       2               2,1     2,2     2,3     2,4',
      '#***************** Pit Exit : Pits ************ South Network *****#',
      'A     35     1       2               5,1     5,2     5,3     5,4',
      '#***************** Pit Entry : Track ******** North Network *******#',
      'A     36     1       2               6,1     6,2     6,3     6,4',
    ].join('\n'));

    const northNetwork = trackConfig.networks.find((network) => network.name === 'North Network');
    const southNetwork = trackConfig.networks.find((network) => network.name === 'South Network');

    expect(withoutLapCompletionFlags(trackConfig).networks.find((network) => network.name === 'North Network')?.lines).toEqual([
      expect.objectContaining({
        line: 1,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 31 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 31 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 31 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 31 },
          { card: 2, comPort: 2, loopNumber: 5, siteAddress: 31 },
          { card: 2, comPort: 2, loopNumber: 6, siteAddress: 31 },
          { card: 2, comPort: 2, loopNumber: 7, siteAddress: 31 },
          { card: 2, comPort: 2, loopNumber: 8, siteAddress: 31 },
          { card: 3, comPort: 2, loopNumber: 9, siteAddress: 31 },
          { card: 3, comPort: 2, loopNumber: 10, siteAddress: 31 },
          { card: 3, comPort: 2, loopNumber: 11, siteAddress: 31 },
          { card: 3, comPort: 2, loopNumber: 12, siteAddress: 31 },
        ],
        name: 'Start/Finish : Track',
      }),
      expect.objectContaining({
        line: 2,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 32 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 32 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 32 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 32 },
        ],
        name: 'Start/Finish : Pits',
      }),
      expect.objectContaining({
        line: 4,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 34 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 34 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 34 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 34 },
        ],
        name: 'Pit Entry : Pits',
      }),
      expect.objectContaining({
        line: 6,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 36 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 36 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 36 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 36 },
        ],
        name: 'Pit Entry : Track',
      }),
    ]);
    expect(withoutLapCompletionFlags(trackConfig).networks.find((network) => network.name === 'South Network')?.lines).toEqual([
      expect.objectContaining({
        line: 3,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 33 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 33 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 33 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 33 },
        ],
        name: 'Speed Trap : Track',
      }),
      expect.objectContaining({
        line: 5,
        loops: [
          { card: 1, comPort: 2, loopNumber: 1, siteAddress: 35 },
          { card: 1, comPort: 2, loopNumber: 2, siteAddress: 35 },
          { card: 1, comPort: 2, loopNumber: 3, siteAddress: 35 },
          { card: 1, comPort: 2, loopNumber: 4, siteAddress: 35 },
        ],
        name: 'Pit Exit : Pits',
      }),
    ]);
    expect(findCtcTrackLineName(trackConfig, 1, 3)).toBe('Start/Finish : Track');
    expect(findCtcTrackLineName(trackConfig, 1, 8)).toBe('Start/Finish : Track');
    expect(findCtcTrackLineName(trackConfig, 1, 12)).toBe('Start/Finish : Track');
    expect(findCtcTrackLoopBySiteAddress(trackConfig, 31, 1)).toEqual(expect.objectContaining({
      line: expect.objectContaining({
        line: 1,
        name: 'Start/Finish : Track',
      }),
      loop: {
        card: 1,
        comPort: 2,
        isLapCompletion: true,
        loopNumber: 1,
        siteAddress: 31,
      },
      network: expect.objectContaining({ name: 'North Network' }),
    }));
    expect(findCtcTrackLineName(trackConfig, 2, 2)).toBe('Start/Finish : Pits');
    expect(findCtcTrackLineName(trackConfig, 3, 4)).toBe('Speed Trap : Track');
    expect(findCtcTrackLineName(trackConfig, 4, 2)).toBe('Pit Entry : Pits');
    expect(findCtcTrackLineName(trackConfig, 5, 4)).toBe('Pit Exit : Pits');
    expect(findCtcTrackLineName(trackConfig, 6, 1)).toBe('Pit Entry : Track');
    expect(getCtcFinishLineNumbers(trackConfig)).toEqual([1, 2]);
    expect(northNetwork?.lines.find((line) => line.line === 1)?.loops.every((loop) => loop.isLapCompletion === true)).toBe(true);
    expect(northNetwork?.lines.find((line) => line.line === 4)?.loops.every((loop) => loop.isLapCompletion === false)).toBe(true);
  });

  it('does not treat pit entry or pit exit lines as lap completions', () => {
    const trackConfig = parseCtcTrackConfig([
      '# Start/Finish : Track ******** North Network *****#',
      'A 31 1 2 1,1 1,2',
      '# Pit Entry : Track ******** North Network *****#',
      'A 36 1 2 6,1 6,2',
    ].join('\n'));
    expect(getCtcFinishLineNumbers(trackConfig)).toEqual([1]);
    expect(trackConfig.networks[0]?.lines.find((line) => line.line === 6)?.loops.every((loop) => loop.isLapCompletion === false)).toBe(true);

    const exitOnlyConfig = parseCtcTrackConfig([
      '# Start/Finish : Track ******** North Network *****#',
      'A 31 1 2 1,1 1,2',
      '# Pit Exit : Track ******** North Network *****#',
      'A 35 1 2 5,1 5,2',
    ].join('\n'));
    expect(getCtcFinishLineNumbers(exitOnlyConfig)).toEqual([1]);
  });

  it('maps explicit and grouped event status codes to descriptions', () => {
    const trackConfig = parseCtcTrackConfig([
      '#**************   Lights : Green,Yellow  *** South Network *****#',
      'E 40,50 41,51 4F,5F',
      '42 Red Flag Light',
    ].join('\n'));

    expect(trackConfig.eventDescriptions['40']).toBe('Green Flag Light');
    expect(trackConfig.eventDescriptions['50']).toBe('Yellow Flag Light');
    expect(trackConfig.eventDescriptions['42']).toBe('Red Flag Light');
  });

  const indyTrackConfigPath = 'C:/Users/tim/OneDrive/RaceTime/timing/DORIAN/INDY/TRACK.CFG';
  const maybeIt = existsSync(indyTrackConfigPath) ? it : it.skip;
  maybeIt('parses the real INDY TRACK.CFG line names and loop/card mappings', () => {
    const trackConfig = parseCtcTrackConfig(readFileSync(indyTrackConfigPath), indyTrackConfigPath);

    expect(findCtcTrackLineName(trackConfig, 1, 1)).toBe('Start/Finish : Track');
    expect(findCtcTrackLineName(trackConfig, 1, 8)).toBe('Start/Finish : Track');
    expect(findCtcTrackLineName(trackConfig, 1, 12)).toBe('Start/Finish : Track');
    expect(findCtcTrackLineName(trackConfig, 2, 10)).toBe('Start/Finish : Pits');
    expect(findCtcTrackLineName(trackConfig, 3, 4)).toBe('Speed Trap : Track');
    expect(findCtcTrackLineName(trackConfig, 5, 12)).toBe('Pit Exit : Pits');
    expect(findCtcTrackLineName(trackConfig, 6, 1)).toBe('Pit Entry : Track');
    expect(findCtcTrackLineName(trackConfig, 12, 16)).toBe('Entry to Turn 1');
    expect(findCtcTrackLoopBySiteAddress(trackConfig, 31, 1)).toEqual(expect.objectContaining({
      line: expect.objectContaining({
        line: 1,
        name: 'Start/Finish : Track',
      }),
      loop: {
        card: 1,
        comPort: 2,
        isLapCompletion: true,
        loopNumber: 1,
        siteAddress: 31,
      },
      network: expect.objectContaining({ name: 'North Network' }),
    }));
    expect(trackConfig.networks.find((network) => network.name === 'North Network')?.lines.find((line) => line.line === 1)?.loops).toContainEqual({
      card: 3,
      comPort: 2,
      isLapCompletion: true,
      loopNumber: 12,
      siteAddress: 31,
    });
    expect(trackConfig.networks.find((network) => network.name === 'South Network')?.lines.find((line) => line.line === 5)?.loops).toContainEqual({
      card: 3,
      comPort: 2,
      isLapCompletion: false,
      loopNumber: 12,
      siteAddress: 35,
    });
  });
});
