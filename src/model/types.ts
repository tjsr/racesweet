export type uuidv5 = string;
export type uuid = uuidv5;
export type IdType = uuid | number;

export interface WithId<Id extends IdType> {
  id: Id;
}

export type ISO8601DateTime = string;
export type ISO8601Date = string;
export type ISO8601Time = string;
export type ISO8601Duration = string;
export type gpstime = number // seconds since 1980-01-06T00:00:00Z;

export type longitude = number; // decimal degreees
export type latitude = number; // decimal degrees
export type elevation = number; // in metres
export type positionAccuracy = number; // in metres

export type PhysicalLocation = [latitude, longitude] | [latitude, longitude, elevation];

export type TimeRecordSourceId = uuid;export type MapOf<T extends WithId<IdType>> = Map<T['id'], T>;

export type PlateNumberType = string | number;
