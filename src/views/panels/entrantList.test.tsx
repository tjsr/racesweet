// @vitest-environment jsdom

import React from 'react';
import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type EntrantType, type EventCatalogEntrant, type EventCatalogState } from '../../app/eventCatalog.js';
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

    expect(container.textContent).toContain('Individual Entrants');
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
      .find((button) => button.querySelector('.entrant-list-type')?.textContent === 'rider');
    expect(riderCard).not.toBeUndefined();
    riderCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(requestFormExit).toHaveBeenCalledTimes(1);
    expect(onSelectEntrant).toHaveBeenCalledWith('rider-1');
  });
});
