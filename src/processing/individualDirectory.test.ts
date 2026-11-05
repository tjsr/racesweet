import { describe, expect, it } from 'vitest';
import { createSeedEventCatalogLedger } from '../ledger/createSeedEventCatalogLedger.js';
import { applyEventCatalogLedger } from '../ledger/eventCatalogLedger.js';
import { createEventParticipantId } from '../model/ids.js';
import { getIndividualDirectoryCards } from './individualDirectory.js';

describe('individual directory projection', () => {
  it('lists shared profiles and unlinked riders or team members for the selected event', () => {
    const catalog = applyEventCatalogLedger(createSeedEventCatalogLedger());
    const eventId = catalog.events[0]!.id;
    const rider = catalog.entrants[0]!;
    const participantId = createEventParticipantId();
    catalog.entrants.push({
      categoryIds: [], entrantType: 'team', eventId, id: 'team-1', memberParticipantIds: [participantId],
      name: 'Relay Team', teamMembers: [{ firstName: 'Team', gender: 'unspecified', lastName: 'Member', participantId }],
    });
    catalog.officials = [{
      archived: false, createdAt: '2026-01-01T00:00:00Z', displayName: 'Alex', id: 'individual-1', notes: '',
      updatedAt: '2026-01-01T00:00:00Z',
    }];
    expect(getIndividualDirectoryCards(catalog, eventId).map((card) => card.label))
      .toEqual(['Alex', rider.name, 'Team Member'].sort((first: string, second: string): number => first.localeCompare(second)));
    catalog.individualLinks = [{
      createdAt: '2026-01-01T00:00:00Z', displayName: rider.name, entrantId: rider.id, eventId,
      id: 'link-1', individualId: 'individual-1', removed: false, updatedAt: '2026-01-01T00:00:00Z',
    }];
    const cards = getIndividualDirectoryCards(catalog, eventId);
    expect(cards).toHaveLength(2);
    expect(cards.find((card) => card.label === 'Alex')?.participantLabel).toBe(rider.name);
    catalog.entrants[0] = { ...rider, name: 'Updated Rider' };
    expect(getIndividualDirectoryCards(catalog, eventId).find((card) => card.label === 'Alex')?.participantLabel)
      .toBe('Updated Rider');
    expect(getIndividualDirectoryCards(catalog, undefined)).toHaveLength(1);
  });
});
