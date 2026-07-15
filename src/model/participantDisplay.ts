import type { EventParticipant } from './eventparticipant.js';

const getIdentifierValue = (participant: EventParticipant, identifierType: 'racePlate' | 'txNo'): string | undefined => {
  const identifier = participant.identifiers.find((candidate) => identifierType in candidate);
  if (!identifier) {
    return undefined;
  }

    const value = (identifier as unknown as Record<string, string | number | undefined>)[identifierType];
  const normalized = value?.toString().trim();
  return normalized || undefined;
};

export const getParticipantDisplayName = (participant: EventParticipant): string => {
  const name = `${participant.firstname || ''} ${participant.surname || ''}`.trim();
  if (name) {
    return name;
  }

  const transmitter = getIdentifierValue(participant, 'txNo');
  if (transmitter) {
    return `Unknown participant with Transponder #${transmitter}`;
  }

  const racePlate = getIdentifierValue(participant, 'racePlate');
  return racePlate ? `Unknown participant #${racePlate}` : 'Unknown participant';
};
