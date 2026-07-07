// @vitest-environment jsdom

import { type EventCatalogState } from '../../catalog/eventCatalog.js';
import { selectedCategoriesForParticipants } from '../../app/selectionState.js';
import type { EventCategory } from '../../model/eventcategory.js';
import type { EventParticipant } from '../../model/eventparticipant.js';
import type { RaceStateLookup } from '../../model/racestate.js';
import { type ParticipantPassingRecord, RECORD_TX_CROSSING } from '../../model/timerecord.js';
import { useUiConsoleGuards } from '../../testing/uiConsoleGuards.js';

import React from 'react';
import { type Root, createRoot } from 'react-dom/client';
import { act } from 'react';
import { TimingContext } from './Timing.js';

const ensureMatchMedia = (): void => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn().mockImplementation((query: string) => {
        return {
          addEventListener: vi.fn(),
          addListener: vi.fn(),
          dispatchEvent: vi.fn(),
          matches: false,
          media: query,
          onchange: null,
          removeEventListener: vi.fn(),
          removeListener: vi.fn(),
        };
      }),
      writable: true,
    });
  }
};

describe('TimingContext integration', () => {
  let container: HTMLDivElement;
  let originalMatchMedia: typeof window.matchMedia | undefined;
  let root: Root;

  useUiConsoleGuards();

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    ensureMatchMedia();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    if (originalMatchMedia) {
      window.matchMedia = originalMatchMedia;
    } else {
      delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    }
  });

  it('updates the selected category row when a crossing row is selected', async () => {
    const categoryA: EventCategory = { code: 'A', id: 'cat-a', name: 'Category A' };
    const categoryB: EventCategory = { code: 'B', id: 'cat-b', name: 'Category B' };
    const participant: EventParticipant = {
      categoryId: categoryB.id,
      currentResult: undefined,
      entrantId: 'entrant-101',
      firstname: 'Pat',
      id: 'participant-101',
      identifiers: [{ fromTime: undefined, racePlate: '101', toTime: undefined }] as unknown as EventParticipant['identifiers'],
      lastRecordTime: null,
      resultDuration: null,
      surname: 'Rider',
    };
    const crossing: ParticipantPassingRecord = {
      chipCode: 100101,
      id: 'crossing-1',
      isValid: true,
      participantId: participant.id,
      recordType: RECORD_TX_CROSSING,
      sequence: 1,
      source: 'test-source',
      time: new Date('2026-05-29T10:06:00.000Z'),
    } as ParticipantPassingRecord;
    const categories = [categoryA, categoryB];
    const participants = new Map<EventParticipant['id'], EventParticipant>([[participant.id, participant]]);
    const event: EventCatalogState['events'][number] = {
      categoryIds: [categoryA.id, categoryB.id],
      date: '2026-05-29',
      entrantIds: [participant.entrantId],
      format: 'race-weekend',
      id: 'event-1',
      name: 'RaceSweet Test Event',
      sessionIds: ['session-1'],
    };
    const session: EventCatalogState['sessions'][number] = {
      categoryIds: [categoryA.id],
      eventId: event.id,
      id: 'session-1',
      kind: 'race',
      name: 'Feature Race',
      scheduledStart: '2026-05-29T10:00:00.000Z',
      status: 'scheduled',
    };
    const raceState: RaceStateLookup & { categories: EventCategory[]; records: ParticipantPassingRecord[] } = {
      categories,
      countTransponderCrossings: () => 1,
      excludeCrossing: () => undefined,
      getCategoryById: (categoryId) => categories.find((category) => category.id === categoryId),
      getEntrantIdForParticipant: (participantId) => participants.get(participantId)?.entrantId,
      getParticipantById: (participantId) => participants.get(participantId),
      getParticipantLaps: () => [crossing],
      getTransponderCrossings: () => [],
      records: [crossing],
      updateCategoryDetails: () => undefined,
      updateEntrantCategory: () => undefined,
      updateParticipantCategory: () => undefined,
    };

    const Harness = (): React.ReactElement => {
      const [selectedCategories, setSelectedCategories] = React.useState<Set<EventCategory['id']>>(new Set());
      const [selectedParticipants, setSelectedParticipants] = React.useState<Set<EventParticipant['id']>>(new Set());

      const handleParticipantSelected = (participantIds: Set<EventParticipant['id']>): void => {
        setSelectedParticipants(participantIds);
        setSelectedCategories(selectedCategoriesForParticipants(participantIds, raceState.getParticipantById));
      };

      return (
        <TimingContext
          activeSession={session}
          categoryListSelected={setSelectedCategories}
          eventTimeZone="Australia/Sydney"
          events={[event]}
          onAddRecord={() => undefined}
          onEditRecord={() => undefined}
          onAssignFlagCategory={() => undefined}
          onChangeCategory={() => undefined}
          onExclude={() => undefined}
          onMarkFlagDeleted={() => undefined}
          onRemoveFlagCategory={() => undefined}
          onSelectEvent={() => undefined}
          onSelectSession={() => undefined}
          onTimeDisplayZoneModeChange={() => undefined}
          participantSelected={handleParticipantSelected}
          raceState={raceState}
          selectedCategories={selectedCategories}
          selectedParticipants={selectedParticipants}
          sessions={[session]}
          timeDisplayZoneMode="event"
          timingEvent={event}
          timingSessionValue="active"
        />
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });

    const selectedCategoryState = (): string | undefined => {
      return container.querySelector('#recent-records-category-dropdown [role="combobox"]')?.textContent || undefined;
    };
    expect(selectedCategoryState()).toBe('All categories');

    const crossingRow = container.querySelector('tr[data-record-id="crossing-1"]');
    expect(crossingRow).not.toBeNull();

    await act(async () => {
      crossingRow!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(selectedCategoryState()).toBe(categoryB.name);
  });
});
