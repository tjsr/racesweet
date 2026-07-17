import { getFinishLineNumbersForSession, normalizeDataSourceConfig } from './systemConfig.js';
import { parseCtcTrackConfig } from '../parsers/ctc/trackConfig.js';

const pitTrackConfig = {
  eventDescriptions: {},
  networks: [{
    name: 'North Network',
    lines: [
      { line: 1, name: 'Start/Finish : Track', loops: [] },
      { line: 2, name: 'Start/Finish : Pits', loops: [] },
    ],
  }],
};

describe('CTC finish line configuration', () => {
  it('adds detected pit start/finish lines to persisted/default finish lines', () => {
    const source = normalizeDataSourceConfig({
      enabled: true,
      fileConfig: { ctcTrackConfig: pitTrackConfig },
      finishLineNumbers: [1],
      id: 'ctc',
      name: 'CTC',
      type: 'file-dorian-ctc-srt',
    });

    expect(source.finishLineNumbers).toEqual([1, 2]);
    expect(getFinishLineNumbersForSession({
      dataSources: [source],
      eventOptions: {},
      eventSourceAssignments: { event: ['ctc'] },
      fastestTimeIndicatorColors: { entrantFasterTime: '', entrantFastestTime: '', sessionFastestTime: '' },
      localStorageDirectoryPath: 'src/generated',
      schemaVersion: 1,
      sessionSourceAssignments: {},
      timingContextSelection: { selectionMode: 'active' },
    }, 'event', 'session')).toEqual([1, 2]);
  });

  it('persists explicit loop selections without re-adding inferred defaults on reload', () => {
    const trackConfig = parseCtcTrackConfig([
      '# Start/Finish : Track ******** North Network *****#',
      'A 31 1 2 1,1 1,2',
      '# Speed Trap : Track ******** North Network *****#',
      'A 32 1 2 2,1',
    ].join('\n'));
    trackConfig.networks[0]!.lines[0]!.loops.forEach((loop) => {
      loop.isLapCompletion = false;
    });

    const source = normalizeDataSourceConfig({
      enabled: true,
      fileConfig: { ctcTrackConfig: trackConfig },
      finishLineNumbers: [1],
      id: 'ctc',
      name: 'CTC',
      type: 'file-dorian-ctc-srt',
    });

    expect(source.finishLineNumbers).toEqual([]);
    expect(normalizeDataSourceConfig(source).finishLineNumbers).toEqual([]);
  });
});
