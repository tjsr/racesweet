
export interface ApicalLapByCategoryViewModel {
  Id: number;
  FullName: string;
  RaceNumber: string;
  LapNumber: number;
  LapTimeSpan: string;
  CumulativeLapTimeSpan: string;
}

export interface ApicalParticipantViewModel {
  LapByCategoryViewModels: ApicalLapByCategoryViewModel[];
  TeamNameDisplay: string;
  CategoryName: string;
  RaceNumbers: string;
  NumberOfLaps: number;
  TotalTimeSpan: string | null;
  Position: number;
}

export interface ApicalCategoryResult {
  CategoryName: string;
  ParticipantViewModels: ApicalParticipantViewModel[];
}

export type ApicalLapByCategory = ApicalCategoryResult[];
