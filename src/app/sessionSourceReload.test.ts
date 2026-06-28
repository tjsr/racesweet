import { createCategoryId, createEventEntrantId, createEventParticipantId, createTimeRecordId } from '../model/ids.js';
import type { RaceState } from '../model/racestate.js';
import type { TimeRecord } from '../model/timerecord.js';
import { getMissingLinkedCategoryIds, mergePulledRaceStates, mergeRaceStateForReload, summarizeSessionSourceReload } from './sessionSourceReload.js';

const existingCategoryId = createCategoryId('existing-category');
const reloadedCategoryId = createCategoryId('reloaded-category');
const existingParticipantId = createEventParticipantId('existing-participant');
const reloadedParticipantId = createEventParticipantId('reloaded-participant');
const existingTeamId = createEventEntrantId('existing-team');
const reloadedTeamId = createEventEntrantId('reloaded-team');
const existingRecordId = createTimeRecordId('existing-record');
const reloadedRecordId = createTimeRecordId('reloaded-record');
const updatedCategoryId = createCategoryId('updated-category');
const updatedParticipantId = createEventParticipantId('updated-participant');
const updatedTeamId = createEventEntrantId('updated-team');
const updatedFlagId = createTimeRecordId('updated-flag');
const updatedCrossingId = createTimeRecordId('updated-crossing');

const activeCategories = (raceState: Partial<RaceState>, categoryId: string) => {
  return (raceState.categories || []).filter((category) => category.id === categoryId && category.deleted !== true);
};

const existingRaceState: Partial<RaceState> = {
  categories: [{ id: existingCategoryId, name: 'Existing Category' }],
  eventStartTime: new Date('2026-06-01T09:00:00.000Z'),
  participants: [{
    categoryId: existingCategoryId,
    currentResult: undefined,
    entrantId: existingParticipantId,
    firstname: 'Existing',
    id: existingParticipantId,
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Rider',
  }],
  records: [{
    id: existingRecordId,
    recordType: 1,
    source: 'existing-source',
    time: new Date('2026-06-01T09:05:00.000Z'),
  }],
  teams: [{
    categoryId: existingCategoryId,
    description: '',
    id: existingTeamId,
    members: [existingParticipantId],
    name: 'Existing Team',
  }],
};

const reloadedRaceState: Partial<RaceState> = {
  categories: [{ id: reloadedCategoryId, name: 'Reloaded Category' }],
  eventStartTime: new Date('2026-06-01T10:00:00.000Z'),
  participants: [{
    categoryId: reloadedCategoryId,
    currentResult: undefined,
    entrantId: reloadedParticipantId,
    firstname: 'Reloaded',
    id: reloadedParticipantId,
    identifiers: [],
    lastRecordTime: null,
    resultDuration: null,
    surname: 'Rider',
  }],
  records: [{
    id: reloadedRecordId,
    recordType: 1,
    source: 'reloaded-source',
    time: new Date('2026-06-01T10:05:00.000Z'),
  }],
  teams: [{
    categoryId: reloadedCategoryId,
    description: '',
    id: reloadedTeamId,
    members: [reloadedParticipantId],
    name: 'Reloaded Team',
  }],
};

describe('sessionSourceReload', () => {
  it('merges multiple pulled source payloads into one race state', () => {
    const merged = mergePulledRaceStates([
      { categories: existingRaceState.categories, records: existingRaceState.records },
      { participants: reloadedRaceState.participants, teams: reloadedRaceState.teams },
    ]);

    expect(merged.categories?.map((category) => category.id)).toEqual([existingCategoryId, reloadedCategoryId]);
    expect(merged.participants?.map((participant) => participant.id)).toEqual([reloadedParticipantId]);
    expect(merged.records?.map((record) => record.id)).toEqual([existingRecordId]);
    expect(merged.teams?.map((team) => team.id)).toEqual([reloadedTeamId]);
  });

  it('replaces only categories when category data is reloaded', () => {
    const merged = mergeRaceStateForReload(existingRaceState, reloadedRaceState, 'categories');

    expect(merged.categories?.map((category) => category.id)).toEqual([reloadedCategoryId, existingCategoryId, existingCategoryId]);
    expect(merged.participants?.map((participant) => participant.id)).toEqual([existingParticipantId]);
    expect(merged.records?.map((record) => record.id)).toEqual([existingRecordId]);
    expect(merged.teams?.map((team) => team.id)).toEqual([existingTeamId]);
    expect((merged.categories || []).filter((category) => category.id === existingCategoryId && category.deleted === true)).toHaveLength(1);
    expect(activeCategories(merged, existingCategoryId)).toHaveLength(1);
    expect(activeCategories(merged, existingCategoryId)[0]).toEqual(expect.objectContaining({
      code: 'MISSING',
      description: expect.stringContaining('Existing Category'),
      excludeFromResults: true,
      name: 'Missing category Existing Category',
    }));
    expect(getMissingLinkedCategoryIds(merged)).toEqual([]);
  });

  it('replaces participants and teams when entrant data is reloaded', () => {
    const merged = mergeRaceStateForReload(existingRaceState, reloadedRaceState, 'entrants');

    expect(merged.categories?.map((category) => category.id)).toEqual([existingCategoryId, reloadedCategoryId, reloadedCategoryId]);
    expect(merged.participants?.map((participant) => participant.id)).toEqual([reloadedParticipantId]);
    expect(merged.records?.map((record) => record.id)).toEqual([existingRecordId]);
    expect(merged.teams?.map((team) => team.id)).toEqual([reloadedTeamId]);
    expect((merged.categories || []).filter((category) => category.id === reloadedCategoryId && category.deleted === true)).toHaveLength(1);
    expect(activeCategories(merged, reloadedCategoryId)).toHaveLength(1);
    expect(activeCategories(merged, reloadedCategoryId)[0]?.name).toBe('Missing category Reloaded Category');
  });

  it('replaces records and event start time when time records are reloaded', () => {
    const merged = mergeRaceStateForReload(existingRaceState, reloadedRaceState, 'time-records');

    expect(merged.categories?.map((category) => category.id)).toEqual([existingCategoryId]);
    expect(merged.participants?.map((participant) => participant.id)).toEqual([existingParticipantId]);
    expect(merged.records?.map((record) => record.id)).toEqual([reloadedRecordId]);
    expect(merged.teams?.map((team) => team.id)).toEqual([existingTeamId]);
    expect(merged.eventStartTime).toEqual(new Date('2026-06-01T10:00:00.000Z'));
  });

  it('summarizes created, deleted, and overwritten reload changes by data type', () => {
    const summary = summarizeSessionSourceReload({
      categories: [
        { id: existingCategoryId, name: 'Deleted Category' },
        { id: updatedCategoryId, name: 'Updated Category' },
      ],
      participants: [
        {
          categoryId: existingCategoryId,
          currentResult: undefined,
          entrantId: existingParticipantId,
          firstname: 'Deleted',
          id: existingParticipantId,
          identifiers: [],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Rider',
        },
        {
          categoryId: updatedCategoryId,
          currentResult: undefined,
          entrantId: updatedParticipantId,
          firstname: 'Updated',
          id: updatedParticipantId,
          identifiers: [],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Rider',
        },
      ],
      records: [
        {
          flagType: 'green',
          id: existingRecordId,
          recordType: 1,
          source: 'existing-source',
          time: new Date('2026-06-01T09:05:00.000Z'),
        } as unknown as TimeRecord,
        {
          flagType: 'green',
          id: updatedFlagId,
          recordType: 1,
          source: 'existing-source',
          time: new Date('2026-06-01T09:10:00.000Z'),
        } as unknown as TimeRecord,
        {
          id: reloadedRecordId,
          plateNumber: '51',
          recordType: 16,
          source: 'existing-source',
          time: new Date('2026-06-01T09:15:00.000Z'),
        } as unknown as TimeRecord,
        {
          id: updatedCrossingId,
          plateNumber: '52',
          recordType: 16,
          source: 'existing-source',
          time: new Date('2026-06-01T09:20:00.000Z'),
        } as unknown as TimeRecord,
      ],
      teams: [
        {
          categoryId: existingCategoryId,
          description: '',
          id: existingTeamId,
          members: [existingParticipantId],
          name: 'Deleted Team',
        },
        {
          categoryId: updatedCategoryId,
          description: '',
          id: updatedTeamId,
          members: [updatedParticipantId],
          name: 'Updated Team',
        },
      ],
    }, {
      categories: [
        { id: updatedCategoryId, name: 'Updated Category' },
        { id: reloadedCategoryId, name: 'Created Category' },
      ],
      participants: [
        {
          categoryId: updatedCategoryId,
          currentResult: undefined,
          entrantId: updatedParticipantId,
          firstname: 'Updated',
          id: updatedParticipantId,
          identifiers: [],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Rider',
        },
        {
          categoryId: reloadedCategoryId,
          currentResult: undefined,
          entrantId: reloadedParticipantId,
          firstname: 'Created',
          id: reloadedParticipantId,
          identifiers: [],
          lastRecordTime: null,
          resultDuration: null,
          surname: 'Rider',
        },
      ],
      records: [
        {
          flagType: 'green',
          id: updatedFlagId,
          recordType: 1,
          source: 'reloaded-source',
          time: new Date('2026-06-01T09:10:00.000Z'),
        } as unknown as TimeRecord,
        {
          flagType: 'red',
          id: reloadedRecordId,
          recordType: 1,
          source: 'reloaded-source',
          time: new Date('2026-06-01T09:15:00.000Z'),
        } as unknown as TimeRecord,
        {
          id: updatedCrossingId,
          plateNumber: '53',
          recordType: 16,
          source: 'reloaded-source',
          time: new Date('2026-06-01T09:20:00.000Z'),
        } as unknown as TimeRecord,
        {
          id: createTimeRecordId('created-crossing'),
          plateNumber: '54',
          recordType: 16,
          source: 'reloaded-source',
          time: new Date('2026-06-01T09:25:00.000Z'),
        } as unknown as TimeRecord,
      ],
      teams: [
        {
          categoryId: updatedCategoryId,
          description: '',
          id: updatedTeamId,
          members: [updatedParticipantId],
          name: 'Updated Team',
        },
        {
          categoryId: reloadedCategoryId,
          description: '',
          id: reloadedTeamId,
          members: [reloadedParticipantId],
          name: 'Created Team',
        },
      ],
    }, 'all');

    expect(summary).toEqual({
      categories: { created: 1, deleted: 1, updated: 1 },
      crossings: { created: 1, deleted: 1, updated: 1 },
      flags: { created: 1, deleted: 1, updated: 1 },
      participants: { created: 1, deleted: 1, updated: 1 },
      teams: { created: 1, deleted: 1, updated: 1 },
    });
  });

  it('only summarizes data types that are included in the selected reload mode', () => {
    const summary = summarizeSessionSourceReload(existingRaceState, {
      ...existingRaceState,
      categories: [
        { id: existingCategoryId, name: 'Existing Category' },
        { id: reloadedCategoryId, name: 'Reloaded Category' },
      ],
    }, 'categories');

    expect(summary).toEqual({
      categories: { created: 1, deleted: 0, updated: 1 },
      crossings: { created: 0, deleted: 0, updated: 0 },
      flags: { created: 0, deleted: 0, updated: 0 },
      participants: { created: 0, deleted: 0, updated: 0 },
      teams: { created: 0, deleted: 0, updated: 0 },
    });
  });
});
