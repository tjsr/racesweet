
type YesNoString = 'Yes' | 'No' | boolean;

type ShortText = string;
type LongText = string;

export interface tEvents {
  ID: number;
  SeriesID: number;
  EventName: string;
  EventDate: Date;
  EventLocation: string;
  EventDistance: number;
  EventDuration: number;
  EventLaps: number;
  GoverningClub: ShortText;
  HostingClub: ShortText;
  Open2GoverningClub: YesNoString;
  TimingStyleCode: ShortText;
  AgeGroupCode: ShortText;
  ReportComments: LongText;
  StartTime: Date;
  EndTime: Date;
  TemperatureMin: number;
  TemperatureMax: number;
  RainFall: number;
  MinLapTime: number;
}

export interface tRiders {
  ID: number;
  CANo: number;
  MTBANo: number;
  IMBANo: number;
  BMXANo: number;
  FirstName: string;
  Surname: string;
  DisplayName: string;
  AgeGroupCode: string;
  Address: string;
  Suburb: string;
  State: string;
  PostCode: string;
  Country: string;
  PhoneNo: string;
  Mobile: string;
  email: string;
  ToReceiveMailOuts: string;
  Gender: string;
  DOB: Date;
  NextOfKin: string;
  EmergencyName: string;
  EmergencyPhone: string;
}

export interface tEventsRiders {
  ID: number;
  EventID: tEvents['ID'];
  EventRaceNo: number;
  TagNo: number;
  CategoryCode: string;
  RiderID: tRiders['ID'];
  TimingAdjustment: number;
  TeamID: tEventsTeams['ID'];
  SpecialStatus: string;
}

export interface tEventRidersResultsCommon {
  ID: number;
  EventID: number;
  EventRaceNo: number;
  TagNo: number;
  CrossLineAtDT: Date;
  CrossLineAt: string;
  TotalRideTime: string;
  SplitTime: string;
  PosNo: number;
}

export interface tEventRidersResults extends tEventRidersResultsCommon {
  IsIgnoring: false;
}

export interface tEventRidersResults_Ignoring extends tEventRidersResultsCommon {
  ReasonTest: string;
  IsIgnoring: true;
}

export interface tEventsCategories {
  ID: number;
  EventID: tEvents['ID'];
  CategoryCode: string;
  CategoryDesc: string;
  IsTeam: number;
  CategoryDistance: number;
  CategoryDuration: number;
  CategoryLaps: number;
  TimingAdjustSecs: number;
  SortField: number;
};

export interface tChipTimes {
  ID: number;
  Location: string;
  ChipCode: string;
  ChipTime: Date;
  ReaderTime: Date;
  Milliseconds: number;
  ReaderNo: number;
  AntennaNo: number;
}

export interface tEventsTeams {
  ID: number;
  EventID: number;
  TeamName: string;
};
