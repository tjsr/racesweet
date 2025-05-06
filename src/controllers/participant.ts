import type { EventParticipant, IdType, ParticipantIdentifier } from "../model/index.js";

const addParticipantIdentifier = (
  participant: EventParticipant,
  identifierType: string,
  value: unknown,
  fromTime?: Date | undefined,
  toTime?: Date | undefined
): boolean => {
  if (participant.identifiers?.some((existingIdentifier: ParticipantIdentifier) => {
    if (identifierType in existingIdentifier) {
      const i = existingIdentifier as unknown as Record<string, unknown>;
      const identifier = i[identifierType];
      if (value === identifier) {
        return true; // Already assigned
      }
    }
    return false;
  })) {
    return false;
  }
  participant.identifiers.push({
    fromTime,
    [identifierType]: value,
    toTime,
  } as ParticipantIdentifier);
  return true;
};

export const assignParticipantNumber = (
  participant: EventParticipant,
  plateNumber: string | number,
  fromTime?: Date | undefined,
  toTime?: Date | undefined
): boolean => addParticipantIdentifier(participant, 'racePlate', plateNumber, fromTime, toTime);

const removeIdentifier = (
  participant: EventParticipant,
  identifierType: string,
  value: unknown
): boolean => {
  const index = participant.identifiers.findIndex((identifier) => {
    if (identifierType in identifier) {
      const i = identifier as unknown as Record<string, unknown>;
      const identifierValue = i[identifierType];
      if (value === identifierValue) {
        return true;
      }
    }
    return false;
  });
  if (index !== -1) {
    participant.identifiers.splice(index, 1);
    return true;
  }
  return false;
};

export const removeParticipantNumber = (
  participant: EventParticipant,
  plateNumber: string | number
): boolean => 
  removeIdentifier(participant, 'racePlate', plateNumber);

const getParticipantIdentifier = (
  participant: EventParticipant,
  identifierType: string,
  lookupTime?: Date | undefined
): string | number | undefined => {
  let ids = participant.identifiers.filter((identifier) => identifierType in identifier);
  if (ids.length === 0) {
    return undefined;
  }
  ids = ids.filter((identifier) => {
    if (identifier.fromTime && lookupTime && identifier.fromTime < lookupTime) {
      return false;
    }
    if (identifier.toTime && lookupTime && identifier.toTime > lookupTime) {
      return false;
    }
  });

  if (ids.length > 1) {
    throw new Error('Participant has multiple race plates assigned.');
  }
  const record = ids[0] as unknown as Record<string, unknown>;
  return record[identifierType] as string | number;
};

const getParticipantIdentifiers = (
  participant: EventParticipant,
  identifierType: string,
  lookupTime?: Date | undefined
): (string|number)[] => {
  let ids = participant.identifiers.filter((identifier) => identifierType in identifier);
  if (ids.length === 0) {
    return [];
  }
  ids = ids.filter((identifier) => {
    if (identifier.fromTime && lookupTime && identifier.fromTime < lookupTime) {
      return false;
    }
    if (identifier.toTime && lookupTime && identifier.toTime > lookupTime) {
      return false;
    }
  });

  return ids.map((identifier) => {
    const record = identifier as unknown as Record<string, unknown>;
    return record[identifierType] as string | number;
  });
};

export const getParticipantNumber = (participant: EventParticipant, lookupTime?: Date|undefined): string | number | undefined => 
  getParticipantIdentifier(participant, 'racePlate', lookupTime);

export const assignTransponder = (
  participant: EventParticipant,
  txNo: string | number,
  fromTime?: Date | undefined,
  toTime?: Date | undefined
): boolean => addParticipantIdentifier(participant, 'txNo', txNo, fromTime, toTime);

export const removeTransponder = (
  participant: EventParticipant,
  txNo: string | number
): boolean => 
  removeIdentifier(participant, 'txNo', txNo);

export const getParticipantTransponders = (
  participant: EventParticipant
): (string|number)[] =>
  getParticipantIdentifiers(participant, 'txNo');


export const matchParticipantToIdentifier = (
  participant: EventParticipant,
  identifier: string | number,
  identifierType: string,
  lookupTime: Date
): IdType | null => {
  const identifiers = getParticipantIdentifiers(participant, identifierType, lookupTime);
  if (identifiers.length >= 1) {
    if (identifiers.length > 1) {
      console.warn(`Participant ${participant.id} has multiple mathing ${identifierType} identifiers: ${identifiers.join(', ')}`);
    }
    return participant.id;
  }
  return null;
};
