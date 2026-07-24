import { describe, expect, it } from 'vitest';
import { createEventId, createSessionId } from '../model/ids.js';
import { type DurtEventCatalogImportService, type DurtFileMakerExtractor, getBundledDurtFileMakerExtractorPath, importDurtFileMakerRaceState, loadDurtFileMakerRaceState, parseFileMakerExtractorOutput } from './durtFileMakerDataSource.js';

describe('DURT FileMaker data source', () => {
  it('resolves the extractor from the Windows-only npm package', () => {
    expect(getBundledDurtFileMakerExtractorPath('C:/RaceSweet')).toBe('C:\\RaceSweet\\packages\\fmptools-win32-x64\\bin\\fmp2json.exe');
  });

  it('validates fmp2json output before converting it to race state', async () => {
    const extractor: DurtFileMakerExtractor = { extract: async (): Promise<string> => JSON.stringify([{ columns: [{ name: 'TX' }, { name: 'Date' }, { name: 'Time' }], name: 'Crossings', values: [{ Date: '01/01/2026', TX: '101', Time: '09:00:00' }] }]) };
    const raceState = await loadDurtFileMakerRaceState({ eventId: createEventId('durt-event'), executablePath: 'fmp2json', sessionId: createSessionId('durt-session'), sourceFilePath: 'C:/DURT/event.fp7', timeZone: 'UTC' }, extractor);
    expect(raceState.records).toHaveLength(1);
    expect(raceState.records?.[0]).toMatchObject({ chipCode: 101 });
  });

  it('reports extraction and conversion progress for the importer UI', async () => {
    const extractor: DurtFileMakerExtractor = {
      extract: async (): Promise<string> => JSON.stringify([{ columns: [{ name: 'TX' }, { name: 'Date' }, { name: 'Time' }], name: 'Crossings', values: [{ Date: '01/01/2026', TX: '101', Time: '09:00:00' }] }]),
    };
    const progress: Array<{ completed: number; currentTask?: string; total: number }> = [];

    await loadDurtFileMakerRaceState({
      additionalProgressSteps: 2,
      eventId: createEventId('durt-event'),
      executablePath: 'fmp2json',
      onProgress: (update) => { progress.push(update); },
      sessionId: createSessionId('durt-session'),
      sourceFilePath: 'C:/DURT/event.fp7',
      timeZone: 'UTC',
    }, extractor);

    expect(progress).toEqual([
      expect.objectContaining({ completed: 0, currentTask: 'Preparing FileMaker database import', total: 4 }),
      expect.objectContaining({ completed: 1, currentTask: 'Extracted event.fp7', total: 4 }),
      expect.objectContaining({ completed: 2, currentTask: 'Converted DURT entrants and crossings', total: 4 }),
    ]);
  });

  it('rejects malformed extractor output with an actionable error', () => {
    expect(() => parseFileMakerExtractorOutput('{not-json}')).toThrow('DURT FileMaker extractor returned invalid JSON');
    expect(() => parseFileMakerExtractorOutput('{}')).toThrow('DURT FileMaker extractor output must be an array');
  });

  it('scaffolds catalog entities before appending the imported race-state ledger mutation', async () => {
    const extractor: DurtFileMakerExtractor = { extract: async (): Promise<string> => JSON.stringify([{ columns: [{ name: 'Category' }, { name: 'First Name' }, { name: 'TX' }], name: 'Enduro Riders', values: [{ Category: 'A Grade', 'First Name': 'Rohin', TX: '101' }] }]) };
    const calls: string[] = [];
    const catalogService: DurtEventCatalogImportService<string> = {
      replaceImportedRaceState: async (): Promise<string> => {
        calls.push('ledger');
        return 'catalog';
      },
      syncEventScaffold: async (): Promise<unknown> => {
        calls.push('scaffold');
        return undefined;
      },
    };
    const result = await importDurtFileMakerRaceState({ eventId: createEventId('durt-event'), executablePath: 'fmp2json', sessionId: createSessionId('durt-session'), sourceFilePath: 'C:/DURT/riders.fp7', timeZone: 'UTC' }, catalogService, extractor);
    expect(result).toBe('catalog');
    expect(calls).toEqual(['scaffold', 'ledger']);
  });
});
