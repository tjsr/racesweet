// @vitest-environment jsdom

import { flushSync } from 'react-dom';
import { type Root, createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { type EventCatalogEntrant } from '../app/eventCatalog.js';
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
        />
      );
    });

    expect(container.textContent).toContain('#73');
    expect(container.textContent).toContain('Tx1234, Tx10000223');
    expect(container.querySelector('.entrant-race-number')).not.toBeNull();
    expect(container.querySelector('.entrant-timing-devices')).not.toBeNull();
  });
});
