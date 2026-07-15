import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { previewMrScatsDataFile } from './filePreview.js';

describe('MR-SCATS TRACK.CFG preview', () => {
  it('previews TRACK.CFG-style CFG files with the CTC line and loop configuration handler', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'racesweet-mrscats-preview-'));
    await writeFile(path.join(tempDir, 'TRACK.CFG'), [
      '#***************** Pit Exit : Pits ************ South Network *****#',
      'A     35     1       2               5,1     5,2',
      'A     35     2       2               5,3     5,4',
    ].join('\r\n'));

    const preview = await previewMrScatsDataFile(tempDir, 'TRACK.CFG', 'track-config');

    expect(preview).toEqual(expect.objectContaining({
      columns: ['Network', 'Line', 'Line name', 'Loop', 'Site address', 'Card', 'Com port'],
      displayedRowCount: 4,
      fileKind: 'track-config',
      parser: 'text',
      recordCount: 4,
    }));
    expect(preview.rows).toEqual([
      {
        Card: 1,
        'Com port': 2,
        Line: 5,
        'Line name': 'Pit Exit : Pits',
        Loop: 1,
        Network: 'South Network',
        'Site address': 35,
      },
      {
        Card: 1,
        'Com port': 2,
        Line: 5,
        'Line name': 'Pit Exit : Pits',
        Loop: 2,
        Network: 'South Network',
        'Site address': 35,
      },
      {
        Card: 2,
        'Com port': 2,
        Line: 5,
        'Line name': 'Pit Exit : Pits',
        Loop: 3,
        Network: 'South Network',
        'Site address': 35,
      },
      {
        Card: 2,
        'Com port': 2,
        Line: 5,
        'Line name': 'Pit Exit : Pits',
        Loop: 4,
        Network: 'South Network',
        'Site address': 35,
      },
    ]);
    expect(preview.warnings.join(' ')).toContain('TRACK.CFG preview: 1 network, 1 line, 4 loops.');
  });
});
