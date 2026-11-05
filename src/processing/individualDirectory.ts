import { getEntrantsForEvent, type EventCatalogEntrant, type EventCatalogState } from '../catalog/eventCatalog.js';
import type { IndividualLink, IndividualLinkTargetInput } from '../model/individualLink.js';
import type { OfficialProfile } from '../model/official.js';
import type { EventParticipantId } from '../model/eventparticipant.js';
import type { EventId } from '../model/raceevent.js';

export interface IndividualDirectoryCard {
  id: string;
  label: string;
  officialRoles: string[];
  participantLabel?: string;
  profile?: OfficialProfile;
  target?: IndividualLinkTargetInput;
}

export const getIndividualDirectoryCards = (
  catalog: EventCatalogState,
  eventId: EventId | undefined,
): IndividualDirectoryCard[] => {
  const activeLinks: IndividualLink[] = (catalog.individualLinks || []).filter((link: IndividualLink): boolean => !link.removed);
  const cards: IndividualDirectoryCard[] = (catalog.officials || []).map((profile: OfficialProfile): IndividualDirectoryCard => {
    const participantLinks: IndividualLink[] = activeLinks.filter((link: IndividualLink): boolean =>
      link.individualId === profile.id && link.eventId === eventId);
    return {
      id: profile.id,
      label: profile.displayName,
      officialRoles: (catalog.officialAssignments || []).filter((assignment): boolean =>
        !assignment.removed && assignment.eventId === eventId && assignment.officialId === profile.id)
        .map((assignment): string => assignment.role),
      participantLabel: participantLinks.map((link: IndividualLink): string => {
        const entrant: EventCatalogEntrant | undefined = catalog.entrants.find((candidate: EventCatalogEntrant): boolean =>
          candidate.id === link.entrantId && candidate.eventId === link.eventId);
        return entrant?.name || link.displayName;
      }).join(', ') || undefined,
      profile,
    };
  });
  if (!eventId) return cards.sort((first: IndividualDirectoryCard, second: IndividualDirectoryCard): number =>
    first.label.localeCompare(second.label));
  const linkedTargets: Set<string> = new Set(activeLinks.filter((link: IndividualLink): boolean => link.eventId === eventId)
    .map((link: IndividualLink): string => `${link.entrantId}|${link.participantId || ''}`));
  getEntrantsForEvent(catalog, eventId).forEach((entrant: EventCatalogEntrant): void => {
    if (entrant.entrantType === 'rider') {
      if (!linkedTargets.has(`${entrant.id}|`)) {
        cards.push({ id: `entrant:${entrant.id}`, label: entrant.name, officialRoles: [],
          target: { entrantId: entrant.id, eventId } });
      }
      return;
    }
    const participantIds: EventParticipantId[] = [...new Set<EventParticipantId>([
      ...entrant.memberParticipantIds,
      ...(entrant.teamMembers || []).map((member: NonNullable<EventCatalogEntrant['teamMembers']>[number]): EventParticipantId =>
        member.participantId),
    ])];
    participantIds.forEach((participantId: EventParticipantId, index: number): void => {
      if (linkedTargets.has(`${entrant.id}|${participantId}`)) return;
      const member = entrant.teamMembers?.find((candidate: NonNullable<EventCatalogEntrant['teamMembers']>[number]): boolean =>
        candidate.participantId === participantId);
      const label: string = member
        ? [member.firstName, member.lastName].filter(Boolean).join(' ').trim()
        : `Member ${index + 1}`;
      cards.push({ id: `member:${entrant.id}:${participantId}`, label,
        officialRoles: [], participantLabel: entrant.name,
        target: { entrantId: entrant.id, eventId, participantId } });
    });
  });
  return cards.sort((first: IndividualDirectoryCard, second: IndividualDirectoryCard): number =>
    first.label.localeCompare(second.label) || first.id.localeCompare(second.id));
};
