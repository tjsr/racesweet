// @vitest-environment jsdom

import React from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EntrantType, type EventCatalogEntrant, type EventCatalogState } from '../../catalog/eventCatalog.js';
import { type EventParticipant } from '../../model/eventparticipant.js';
import { EntrantListPanel } from './entrantList.js';

const riderEntrant: EventCatalogEntrant = {
  categoryId: 'category-1',
  categoryIds: ['category-1'],
  entrantType: 'rider',
  eventId: 'event-1',
  id: 'rider-1',
  memberParticipantIds: [],
  name: 'Rider One',
  sessionIds: [],
  teamEntrantId: 'team-1',
};

const teamEntrant: EventCatalogEntrant = {
  categoryId: 'category-1',
  categoryIds: ['category-1'],
  entrantType: 'team',
  eventId: 'event-1',
  id: 'team-1',
  memberParticipantIds: ['rider-1'],
  name: 'Fast Friends',
  sessionIds: [],
};

const catalog: EventCatalogState = {
  activeEventId: 'event-1',
  categories: [{ eventId: 'event-1', id: 'category-1', name: 'Premier' }],
  deletedEventIds: [],
  entrants: [riderEntrant, teamEntrant],
  events: [{
    categoryIds: ['category-1'],
    date: '2026-06-27',
    entrantIds: ['rider-1', 'team-1'],
    format: 'other',
    id: 'event-1',
    name: 'Event One',
    sessionIds: [],
  }],
  sessions: [],
};

const participant: EventParticipant = {
  categoryId: 'category-1',
  currentResult: undefined,
  entrantId: 'rider-1',
  firstname: 'Rider',
  id: 'rider-1',
  identifiers: [
    { fromTime: undefined, racePlate: '73', toTime: undefined },
    { fromTime: undefined, toTime: undefined, txNo: '1234' },
  ] as unknown as EventParticipant['identifiers'],
  lastRecordTime: null,
  resultDuration: null,
  surname: 'One',
};

describe('EntrantListPanel', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders rider and team entrant cards and routes create and select actions through the guard', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onCreateEntrant = vi.fn();
    const onSelectEntrant = vi.fn();
    const requestFormExit = vi.fn((action: () => void | Promise<void>) => {
      void action();
    });

    const Harness = (): React.ReactElement => {
      const [createKind, setCreateKind] = React.useState<EntrantType>('rider');

      return (
        <EntrantListPanel
          catalog={catalog}
          createKind={createKind}
          filteredTeamEntrants={[teamEntrant]}
          onCreateEntrant={onCreateEntrant}
          onSelectEntrant={onSelectEntrant}
          raceStateParticipants={[participant]}
          requestFormExit={requestFormExit}
          riderEntrants={[riderEntrant]}
          selectedEntrant={riderEntrant}
          selectedEventId="event-1"
          setCreateKind={setCreateKind}
          teamEntrants={[teamEntrant]}
          teamsEnabled={true}
        />
      );
    };

    flushSync(() => {
      root?.render(<Harness />);
    });

    expect(container.textContent).toContain('Individual Drivers');
    expect(container.textContent).toContain('Teams');
    expect(container.textContent).toContain('Rider One');
    expect(container.textContent).toContain('Premier');
    expect(container.textContent).toContain('Team: Fast Friends');
    expect(container.textContent).toContain('#73');
    expect(container.textContent).toContain('Tx1234');

    const createKindSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Create Entrant Kind"]');
    expect(createKindSelect).not.toBeNull();
    flushSync(() => {
      createKindSelect!.value = 'team';
      createKindSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const createButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Create Team');
    expect(createButton).not.toBeUndefined();
    createButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(requestFormExit).toHaveBeenCalledTimes(1);
    expect(onCreateEntrant).toHaveBeenCalledWith('event-1', 'team');

    const teamCard = Array.from(container.querySelectorAll<HTMLButtonElement>('button.events-list-item'))
      .find((button) => button.getAttribute('aria-selected') === 'false' && button.textContent?.includes('Fast Friends'));
    expect(teamCard).not.toBeUndefined();
    teamCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(requestFormExit).toHaveBeenCalledTimes(2);
    expect(onSelectEntrant).toHaveBeenCalledWith('team-1');
  });

  it('sends individual entrant card selections through the global selection listener', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const onSelectEntrant = vi.fn();
    const requestFormExit = vi.fn((action: () => void | Promise<void>) => {
      void action();
    });

    const Harness = (): React.ReactElement => {
      const [createKind, setCreateKind] = React.useState<EntrantType>('rider');

      return (
        <EntrantListPanel
          catalog={catalog}
          createKind={createKind}
          filteredTeamEntrants={[teamEntrant]}
          onCreateEntrant={() => undefined}
          onSelectEntrant={onSelectEntrant}
          raceStateParticipants={[participant]}
          requestFormExit={requestFormExit}
          riderEntrants={[riderEntrant]}
          selectedEntrant={teamEntrant}
          selectedEventId="event-1"
          setCreateKind={setCreateKind}
          teamEntrants={[teamEntrant]}
          teamsEnabled={true}
        />
      );
    };

    flushSync(() => {
      root?.render(<Harness />);
    });

    const riderCard = Array.from(container.querySelectorAll<HTMLButtonElement>('button.events-list-item'))
      .find((button) => button.querySelector('.entrant-list-type')?.textContent === 'driver');
    expect(riderCard).not.toBeUndefined();
    riderCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(requestFormExit).toHaveBeenCalledTimes(1);
    expect(onSelectEntrant).toHaveBeenCalledWith('rider-1');
  });

  it('uses catalog entrant identifiers when a race-state participant is not loaded', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const entrantWithImportedIdentifiers: EventCatalogEntrant = {
      ...riderEntrant,
      identifiers: [
        { fromTime: undefined, racePlate: '15', toTime: undefined },
        { fromTime: undefined, toTime: undefined, txNo: 315 },
      ] as unknown as EventParticipant['identifiers'],
    };

    const Harness = (): React.ReactElement => {
      const [createKind, setCreateKind] = React.useState<EntrantType>('rider');

      return (
        <EntrantListPanel
          catalog={{
            ...catalog,
            entrants: [entrantWithImportedIdentifiers],
            events: [{
              ...catalog.events[0]!,
              entrantIds: [entrantWithImportedIdentifiers.id],
            }],
          }}
          createKind={createKind}
          filteredTeamEntrants={[]}
          onCreateEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          raceStateParticipants={[]}
          requestFormExit={() => undefined}
          riderEntrants={[entrantWithImportedIdentifiers]}
          selectedEntrant={entrantWithImportedIdentifiers}
          selectedEventId="event-1"
          setCreateKind={setCreateKind}
          teamEntrants={[]}
          teamsEnabled={false}
        />
      );
    };

    flushSync(() => {
      root?.render(<Harness />);
    });

    expect(container.textContent).toContain('#15');
    expect(container.textContent).toContain('Tx315');
  });

  it('reorders entrant cards when the sort order changes', () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const alphaCategory = { eventId: 'event-1', id: 'category-alpha', name: 'A Grade' };
    const betaCategory = { eventId: 'event-1', id: 'category-beta', name: 'B Grade' };
    const zedCategory = { eventId: 'event-1', id: 'category-zed', name: 'Z Grade' };
    const zedEntrant: EventCatalogEntrant = {
      categoryId: zedCategory.id,
      categoryIds: [zedCategory.id],
      entrantType: 'rider',
      eventId: 'event-1',
      firstName: 'Ari',
      id: 'rider-zed',
      lastName: 'Zed',
      memberParticipantIds: [],
      name: 'Ari Zed',
      sessionIds: [],
    };
    const betaEntrant: EventCatalogEntrant = {
      categoryId: betaCategory.id,
      categoryIds: [betaCategory.id],
      entrantType: 'rider',
      eventId: 'event-1',
      firstName: 'Bea',
      id: 'rider-beta',
      lastName: 'Beta',
      memberParticipantIds: [],
      name: 'Bea Beta',
      sessionIds: [],
    };
    const alphaEntrant: EventCatalogEntrant = {
      categoryId: alphaCategory.id,
      categoryIds: [alphaCategory.id],
      entrantType: 'rider',
      eventId: 'event-1',
      firstName: 'Cal',
      id: 'rider-alpha',
      lastName: 'Alpha',
      memberParticipantIds: [],
      name: 'Cal Alpha',
      sessionIds: [],
    };
    const sortCatalog: EventCatalogState = {
      ...catalog,
      categories: [alphaCategory, betaCategory, zedCategory],
      entrants: [zedEntrant, betaEntrant, alphaEntrant],
      events: [{
        ...catalog.events[0]!,
        categoryIds: [alphaCategory.id, betaCategory.id, zedCategory.id],
        entrantIds: [zedEntrant.id, betaEntrant.id, alphaEntrant.id],
      }],
    };
    const participants: EventParticipant[] = [
      {
        ...participant,
        categoryId: zedCategory.id,
        entrantId: zedEntrant.id,
        firstname: 'Ari',
        id: zedEntrant.id,
        identifiers: [{ fromTime: undefined, racePlate: '30', toTime: undefined }] as unknown as EventParticipant['identifiers'],
        surname: 'Zed',
      },
      {
        ...participant,
        categoryId: betaCategory.id,
        entrantId: betaEntrant.id,
        firstname: 'Bea',
        id: betaEntrant.id,
        identifiers: [{ fromTime: undefined, racePlate: '2', toTime: undefined }] as unknown as EventParticipant['identifiers'],
        surname: 'Beta',
      },
      {
        ...participant,
        categoryId: alphaCategory.id,
        entrantId: alphaEntrant.id,
        firstname: 'Cal',
        id: alphaEntrant.id,
        identifiers: [{ fromTime: undefined, racePlate: '10', toTime: undefined }] as unknown as EventParticipant['identifiers'],
        surname: 'Alpha',
      },
    ];

    const Harness = (): React.ReactElement => {
      const [createKind, setCreateKind] = React.useState<EntrantType>('rider');

      return (
        <EntrantListPanel
          catalog={sortCatalog}
          createKind={createKind}
          filteredTeamEntrants={[]}
          onCreateEntrant={() => undefined}
          onSelectEntrant={() => undefined}
          raceStateParticipants={participants}
          requestFormExit={() => undefined}
          riderEntrants={[zedEntrant, betaEntrant, alphaEntrant]}
          selectedEventId="event-1"
          setCreateKind={setCreateKind}
          teamEntrants={[]}
          teamsEnabled={false}
        />
      );
    };
    const cardNames = (): string[] => Array.from(container!.querySelectorAll('.entrant-list-name'))
      .map((element) => element.textContent || '');

    flushSync(() => {
      root?.render(<Harness />);
    });

    expect(cardNames()).toEqual(['Cal Alpha', 'Bea Beta', 'Ari Zed']);

    const sortSelect = container.querySelector<HTMLSelectElement>('select[aria-label="Sort Entrants"]');
    expect(sortSelect).not.toBeNull();
    expect(Array.from(sortSelect!.options).map((option) => option.textContent)).toEqual(['Surname', 'Plate number', 'Grade']);

    flushSync(() => {
      sortSelect!.value = 'plateNumber';
      sortSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(cardNames()).toEqual(['Bea Beta', 'Cal Alpha', 'Ari Zed']);

    flushSync(() => {
      sortSelect!.value = 'grade';
      sortSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(cardNames()).toEqual(['Cal Alpha', 'Bea Beta', 'Ari Zed']);
  });
});
