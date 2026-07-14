import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSrt } from './parser.js';

test('decodes SRT crossing and control fields, deriving time-of-day from the visible row', (): void => {
  const records = parseSrt([
    '600881437728440008814377286801 021 19:48:48.6801 00',
    '040881438149697001300108255000002',
    '4008814385499814',
  ].join('\r'));

  assert.deepEqual(records.map((record) => ({
    controlMeaning: record.controlMeaning,
    drtCode: record.drtCode,
    hitCount: record.hitCount,
    lineNumber: record.lineNumber,
    loopNumber: record.loopNumber,
    timeOfDay: record.timeOfDay,
    transmitter: record.transmitter,
  })), [
    { controlMeaning: undefined, drtCode: 'SRT', hitCount: undefined, lineNumber: undefined, loopNumber: undefined, timeOfDay: '19:48:48.6801', transmitter: 6008 },
    { controlMeaning: undefined, drtCode: '04', hitCount: 2, lineNumber: 1, loopNumber: 8, timeOfDay: '19:55:49.6970', transmitter: 130 },
    { controlMeaning: 'Start of race', drtCode: '40', hitCount: undefined, lineNumber: undefined, loopNumber: undefined, timeOfDay: '20:02:29.9814', transmitter: undefined },
  ]);
});
