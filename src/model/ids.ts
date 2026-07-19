import { v5 as uuidv5, v7 as uuidv7, validate as validateUuid } from 'uuid';
import type { EventEntrantId } from './entrant.ts';
import type { EventEntryId } from './entry.ts';
import { EventCategoryId } from "./eventcategory.ts";
import type { EventParticipantId } from './eventparticipant.ts';
import { EventId, SessionId } from './raceevent.ts';
import type { TimeRecordId } from './timerecord.ts';
import { TimingPointId } from "./timingpoint.ts";
import { IdType, TimeRecordSourceId } from "./types.ts";

const UUID_NAMESPACE = 'd9b2d63d-a233-4123-847a-7e84c8b12475';

export type IdReplacementMap = Map<string, IdType>;

export interface ImportedObjectIdRewriteResult<T> {
  idMap: IdReplacementMap;
  value: T;
}

export interface ImportedObjectIdRewriteOptions {
  logRemappedIds?: boolean;
}

export const createId = <Id extends IdType>(idType: IdType, seedData?: string): Id => {
  return !seedData ? uuidv7() as Id : uuidv5(seedData, uuidv5(idType, UUID_NAMESPACE)) as Id;
};

export const createEventId = (seedData?: string): EventId => createId<EventId>('eventId', seedData);
export const createSessionId = (seedData?: string): SessionId => createId<SessionId>('sessionId', seedData);
export const createCategoryId = (seedData?: string): EventCategoryId => createId<EventCategoryId>('categoryId', seedData);
export const createEventEntrantId = (seedData?: string): EventEntrantId => createId<EventEntrantId>('entrantId', seedData);
export const createEventEntryId = (seedData?: string): EventEntryId => createId<EventEntryId>('entryId', seedData);
export const createEventParticipantId = (seedData?: string): EventParticipantId => createId<EventParticipantId>('participantId', seedData);
export const createTimingPointId = (seedData?: string): TimingPointId => createId<TimingPointId>('timingPointId', seedData);
export const createTimeRecordId = (seedData?: string): TimeRecordId => createId<TimeRecordId>('timeRecordId', seedData);
export const createTimeRecordSourceId = (seedData?: string): TimeRecordSourceId => createId<TimeRecordSourceId>('sourceId', seedData);
export const createMutationId = (seedData?: string): IdType => createId<IdType>('mutationId', seedData);

const collectionIdTypes: Record<string, IdType> = {
  categories: 'categoryId',
  dataSources: 'sourceId',
  entrants: 'entrantId',
  entries: 'entryId',
  events: 'eventId',
  flags: 'timeRecordId',
  mutations: 'mutationId',
  participants: 'participantId',
  records: 'timeRecordId',
  sessions: 'sessionId',
  sources: 'sourceId',
  teams: 'entrantId',
  timeRecords: 'timeRecordId',
  timingPoints: 'timingPointId',
};

const objectIdTypes: Record<string, IdType> = {
  category: 'categoryId',
  crossing: 'timeRecordId',
  dataSource: 'sourceId',
  entrant: 'entrantId',
  entry: 'entryId',
  event: 'eventId',
  flag: 'timeRecordId',
  mutation: 'mutationId',
  participant: 'participantId',
  record: 'timeRecordId',
  session: 'sessionId',
  source: 'sourceId',
  team: 'entrantId',
  timeRecord: 'timeRecordId',
  timingPoint: 'timingPointId',
};

type EventComponentIdType = 'categoryId' | 'entrantId' | 'entryId' | 'sessionId';
type EventComponentListKey = 'categoryIds' | 'entrantIds' | 'entryIds' | 'sessionIds';

const eventComponentListKeys: Record<EventComponentIdType, EventComponentListKey> = {
  categoryId: 'categoryIds',
  entrantId: 'entrantIds',
  entryId: 'entryIds',
  sessionId: 'sessionIds',
};

interface EventChildReference {
  eventId: EventId;
  id: EventId;
  idType: EventComponentIdType;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !(value instanceof Date) && !ArrayBuffer.isView(value);
};

const singularize = (key: string): string => {
  if (key.endsWith('ies')) {
    return `${key.slice(0, -3)}y`;
  }
  if (key.endsWith('s')) {
    return key.slice(0, -1);
  }
  return key;
};

const inferObjectIdType = (key: string | undefined): IdType | undefined => {
  if (!key) {
    return undefined;
  }

  return collectionIdTypes[key] || objectIdTypes[key] || objectIdTypes[singularize(key)];
};

const inferIdTypeFromProperty = (key: string): IdType | undefined => {
  if (key === 'id') {
    return undefined;
  }
  const idKey = key.startsWith('active') && key.length > 'active'.length
    ? `${key.charAt('active'.length).toLowerCase()}${key.slice('active'.length + 1)}`
    : key;
  if (idKey === 'memberParticipantId' || idKey === 'memberParticipantIds') {
    return 'participantId';
  }
  if (idKey === 'source') {
    return 'sourceId';
  }
  if (idKey.endsWith('Ids') && idKey.length > 3) {
    return `${idKey.slice(0, -1)}` as IdType;
  }
  if (idKey.endsWith('Id') && idKey.length > 2) {
    return idKey as IdType;
  }
  return undefined;
};

const registerId = (idMap: IdReplacementMap, idType: IdType | undefined, value: unknown, options: ImportedObjectIdRewriteOptions): void => {
  if (!idType || typeof value !== 'string' || value.trim().length === 0 || idMap.has(value)) {
    return;
  }

  const replacementId = validateUuid(value) ? value : createId(idType, value);
  if (options.logRemappedIds && replacementId !== value) {
    console.warn(`Re-mapped ${idType} id ${value} to ${replacementId}`);
  }
  idMap.set(value, replacementId);
};

const collectIdReplacements = (value: unknown, idMap: IdReplacementMap, options: ImportedObjectIdRewriteOptions, objectIdType?: IdType, containerKey?: string): void => {
  if (Array.isArray(value)) {
    const arrayItemIdType = inferObjectIdType(containerKey);
    value.forEach((item) => collectIdReplacements(item, idMap, options, arrayItemIdType, containerKey));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const nextObjectIdType = objectIdType || inferObjectIdType(containerKey);
  registerId(idMap, nextObjectIdType, value.id, options);

  Object.entries(value).forEach(([key, entry]) => {
    const propertyIdType = inferIdTypeFromProperty(key);
    if (propertyIdType) {
      if (Array.isArray(entry)) {
        entry.forEach((item) => registerId(idMap, propertyIdType, item, options));
      } else {
        registerId(idMap, propertyIdType, entry, options);
      }
    }

    collectIdReplacements(entry, idMap, options, inferObjectIdType(key), key);
  });
};

const replaceIdReferences = (value: unknown, idMap: IdReplacementMap, options: ImportedObjectIdRewriteOptions, objectIdType?: IdType, containerKey?: string): unknown => {
  if (Array.isArray(value)) {
    const arrayItemIdType = inferObjectIdType(containerKey);
    return value.map((item) => replaceIdReferences(item, idMap, options, arrayItemIdType, containerKey));
  }

  if (!isRecord(value)) {
    return value;
  }

  const nextObjectIdType = objectIdType || inferObjectIdType(containerKey);
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    const propertyIdType = inferIdTypeFromProperty(key);
    if (key === 'id' && typeof entry === 'string') {
      if (nextObjectIdType) {
        registerId(idMap, nextObjectIdType, entry, options);
      }
      return [key, idMap.get(entry) || entry];
    }

    if (propertyIdType) {
      if (Array.isArray(entry)) {
        return [key, entry.map((item) => typeof item === 'string' ? idMap.get(item) || item : item)];
      }
      return [key, typeof entry === 'string' ? idMap.get(entry) || entry : entry];
    }

    return [key, replaceIdReferences(entry, idMap, options, inferObjectIdType(key), key)];
  }));
};

const isEventComponentIdType = (idType: IdType | undefined): idType is EventComponentIdType => {
  return idType === 'categoryId' || idType === 'entrantId' || idType === 'entryId' || idType === 'sessionId';
};

const collectEventComponentRelationships = (
  value: unknown,
  eventsById: Map<string, Record<string, unknown>>,
  childReferences: EventChildReference[],
  objectIdType?: IdType,
  containerKey?: string
): void => {
  if (Array.isArray(value)) {
    const arrayItemIdType = inferObjectIdType(containerKey);
    value.forEach((item) => collectEventComponentRelationships(item, eventsById, childReferences, arrayItemIdType, containerKey));
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  const nextObjectIdType = objectIdType || inferObjectIdType(containerKey);
  if (nextObjectIdType === 'eventId' && typeof value.id === 'string') {
    eventsById.set(value.id, value);
  } else if (
    isEventComponentIdType(nextObjectIdType) &&
    typeof value.eventId === 'string' &&
    typeof value.id === 'string'
  ) {
    childReferences.push({
      eventId: value.eventId,
      id: value.id,
      idType: nextObjectIdType,
    });
  }

  Object.entries(value).forEach(([key, entry]) => {
    collectEventComponentRelationships(entry, eventsById, childReferences, inferObjectIdType(key), key);
  });
};

const appendUniqueString = (values: unknown, value: string): string[] => {
  const currentValues = Array.isArray(values)
    ? values.filter((item): item is string => typeof item === 'string')
    : [];
  return currentValues.includes(value) ? currentValues : [...currentValues, value];
};

const reconcileEventComponentRelationships = (value: unknown): void => {
  const eventsById = new Map<string, Record<string, unknown>>();
  const childReferences: EventChildReference[] = [];
  collectEventComponentRelationships(value, eventsById, childReferences);
  childReferences.forEach((childReference) => {
    const parentEvent = eventsById.get(childReference.eventId);
    if (!parentEvent) {
      return;
    }

    const componentListKey = eventComponentListKeys[childReference.idType];
    parentEvent[componentListKey] = appendUniqueString(parentEvent[componentListKey], childReference.id);
  });
};

export const rewriteImportedObjectIds = <T>(value: T, options: ImportedObjectIdRewriteOptions = {}): ImportedObjectIdRewriteResult<T> => {
  const idMap: IdReplacementMap = new Map();
  collectIdReplacements(value, idMap, options);
  const rewrittenValue = replaceIdReferences(value, idMap, options) as T;
  reconcileEventComponentRelationships(rewrittenValue);
  return {
    idMap,
    value: rewrittenValue,
  };
};
