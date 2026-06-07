import { EventCategoryId } from "./eventcategory.ts";
import { EventId } from './raceevent.ts';
import { IdType } from "./types.ts"
import { TimingPointId } from "./timingpoint.ts";

const createId = <Id extends IdType>(idType: IdType): Id => {
  return idType as Id;
};

export const createEventId = (): EventId => createId<EventId>('eventId');
export const createCategoryId = (): EventCategoryId => createId<EventCategoryId>('categoryId');
// export const createEntrantId = (id: string): EntrantId => createId<EntrantId>(id);
export const createTimingPointId = (): TimingPointId => createId<TimingPointId>('timingPointId');
