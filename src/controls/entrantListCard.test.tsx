// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { type EventCatalogEntrant } from '../catalog/eventCatalog.js';
import { EntrantListCard } from './entrantListCard.js';

const baseEntrant: EventCatalogEntrant = {
  categoryIds: [],
  entrantType: 'rider',
  eventId: 'event-1',
  id: 'entrant-1',
  memberParticipantIds: [],
  name: 'Rider One',
  sessionIds: [],
};

describe('EntrantListCard', () => {
  let container: HTMLDivElement | undefined;
  let root: Root | undefined;

  afterEach(() => {
    root?.unmount();
    container?.remove();
    root = undefined;
    container = undefined;
  });

  it('renders race number and timing devices in the card header when provided', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    flushSync(() => {
      root?.render(
        <EntrantListCard
          categoryName="Premier"
          entrant={baseEntrant}
          isSelected={false}
          onSelect={() => undefined}
          raceNumber={73}
          timingDevices={['1234', 'Tx10000223']}
          teamName="Fast Friends"
        />
      );
    });

    const header = container.querySelector('.entrant-list-card-header');
    const identifiers = container.querySelector('.entrant-list-card-identifiers');
    const raceNumber = container.querySelector('.entrant-race-number');
    const timingDevices = container.querySelector('.entrant-timing-devices');
    const teamRow = container.querySelector('.entrant-list-team-row');
    const teamName = container.querySelector('.entrant-team-chip');
    const entrantType = container.querySelector('.entrant-list-type');

    expect(header?.firstElementChild?.classList.contains('entrant-list-name')).toBe(true);
    expect(header?.lastElementChild).toBe(identifiers);
    expect(identifiers?.children[0]).toBe(raceNumber);
    expect(identifiers?.children[1]).toBe(timingDevices);
    expect(raceNumber?.textContent).toBe('#73');
    expect(timingDevices?.textContent).toBe('Tx1234, Tx10000223');
    expect(teamRow?.children[0]).toBe(teamName);
    expect(teamRow?.children[1]).toBe(entrantType);
    expect(teamName?.textContent).toBe('Team: Fast Friends');
    expect(entrantType?.textContent).toBe('driver');
  });
});
