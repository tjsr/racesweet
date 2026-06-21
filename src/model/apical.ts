

export interface ApicalEventResponseEventData {
  Id: number;
  Name: string;
  EventDate: string;
  CompanyName: string;
  ThumbPathAndFileName: string;
}

export type ApicalEventListResponse = ApicalEventResponseEventData[];

export interface ApicalLapByCategoryViewModel {
  Id: number;
  FullName: string;
  RaceNumber: string;
  LapNumber: number;
  LapTimeSpan: string | number;
  CumulativeLapTimeSpan: string | number;
}

export interface ApicalParticipantViewModel {
  LapByCategoryViewModels: ApicalLapByCategoryViewModel[];
  TeamNameDisplay: string;
  CategoryName: string;
  RaceNumbers: string;
  NumberOfLaps: number;
  TotalTimeSpan: string | number | null;
  Position: number;
}

export interface ApicalCategoryResult {
  CategoryName: string;
  ParticipantViewModels: ApicalParticipantViewModel[];
}

export type ApicalLapByCategory = ApicalCategoryResult[];
