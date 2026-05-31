import { ApicalSpreadsheetLapsRow } from "./apicalEventSpreadsheet.js";

const MIN_LAPS_FOR_MEDIAN_RESULT = 3;
const EPSILON = 0.000001;

export const getEntrantLapTimeMap = (lapsData: ApicalSpreadsheetLapsRow[]): Map<string, number[]> => {
  const entrantLapTimes: Map<string, number[]> = new Map();
  
  lapsData
    .filter((lap) => !(lap.FullName.toLowerCase().includes("unknown")))
    .forEach((lap) => {
      const entrantName = lap.FullName.toLowerCase();
      const entrantCategory = lap.CategoryName.toLowerCase();
      const lapTime = lap.LapSeconds;
      const entrantKey: string = `${entrantCategory}-${entrantName}`;
      if (!entrantLapTimes.has(entrantKey)) {
        entrantLapTimes.set(entrantKey, []);
      }
      entrantLapTimes.get(entrantKey)?.push(lapTime);
    });
  
  return entrantLapTimes;
};

export const calculateAverageLapTime = (lapTimes: number[]): number => {
  if (lapTimes.length === 0) return 0;
  const total = lapTimes.reduce((sum, time) => sum + time, 0);
  return total / lapTimes.length;
};

export const calculateTotalRaceTime = (lapTimes: number[]): number => {
  return lapTimes.reduce((total, time) => total + time, 0);
};

export const calculateBestLapTime = (lapTimes: number[]): number => {
  if (lapTimes.length === 0) return 0;
  return Math.min(...lapTimes);
};

export const calculateLapTimeConsistency = (lapTimes: number[]): number => {
  if (lapTimes.length === 0) return 0;
  const average = calculateAverageLapTime(lapTimes);
  const variance = lapTimes.reduce((sum, time) => sum + Math.pow(time - average, 2), 0) / lapTimes.length;
  return Math.sqrt(variance);
};

export const calculateMedianLapTime = (lapTimes: number[]): number => {
  if (lapTimes.length === 0) return 0;
  const sorted = [...lapTimes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

export const getAllMedianLapTimes = (entrantLapTimes: Map<string, number[]>, minLapsForMedianResult: number = MIN_LAPS_FOR_MEDIAN_RESULT): Map<string, number> => {
  const medianLapTimes: Map<string, number> = new Map();
  entrantLapTimes.forEach((lapTimes, entrant) => {
    if (lapTimes.length >= minLapsForMedianResult) {
      medianLapTimes.set(entrant, calculateMedianLapTime(lapTimes));
    }
  });
  return medianLapTimes;
};

export interface EventHandicapData {
  entrantData: EventEntrantHandicapData[];
}

export interface EventEntrantHandicapData {
  confidenceFactor: number;
  name: string;
  category: string;
  medianLapTime: number;
  ratioScore: number;
}

interface ConfidenceProfile {
  entrantKey: string;
  medianLapTime: number;
  standardDeviation: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const roundTo3Dp = (value: number): number => Number(value.toFixed(3));

const getCategoryFromEntrantKey = (entrantKey: string): string => {
  const separatorIndex = entrantKey.indexOf('-');
  return separatorIndex >= 0 ? entrantKey.slice(0, separatorIndex) : 'unknown';
};

const buildConfidenceProfiles = (entrantLapTimes: Map<string, number[]>, eligibleEntrants: Set<string>): ConfidenceProfile[] =>
  Array.from(eligibleEntrants).map((entrantKey) => {
    const lapTimes = entrantLapTimes.get(entrantKey) || [];
    return {
      entrantKey,
      medianLapTime: calculateMedianLapTime(lapTimes),
      standardDeviation: calculateLapTimeConsistency(lapTimes),
    };
  });

const calculateConfidenceByEntrant = (entrantLapTimes: Map<string, number[]>, eligibleEntrants: Set<string>): Map<string, number> => {
  const confidenceByEntrant = new Map<string, number>();
  const profiles = buildConfidenceProfiles(entrantLapTimes, eligibleEntrants);

  profiles.forEach((profile) => {
    const scale = Math.max(profile.medianLapTime, EPSILON);
    const normalizedStandardDeviation = profile.standardDeviation / scale;
    const confidenceScore = clamp(1 - normalizedStandardDeviation, 0, 1) * 100;
    confidenceByEntrant.set(profile.entrantKey, roundTo3Dp(confidenceScore));
  });

  return confidenceByEntrant;
};

export const calculateEventHandicapData = (event: { Id: number; Name: string }, lapsData: ApicalSpreadsheetLapsRow[]): EventHandicapData => {
  const entrantLapTimes: Map<string, number[]> = getEntrantLapTimeMap(lapsData);
  const medianLaps: Map<string, number> = getAllMedianLapTimes(entrantLapTimes);
  const confidenceByEntrant = calculateConfidenceByEntrant(entrantLapTimes, new Set(medianLaps.keys()));
  const medianValues: number[] = Array.from(medianLaps.values());
  const lowMedian = Math.min(...medianValues);
  const highMedian = Math.max(...medianValues);
  const medianRange = highMedian - lowMedian;

  const result: EventHandicapData = {
    entrantData: Array.from(medianLaps.entries()).map(([entrant, median]) => {
      const entrantCategory = getCategoryFromEntrantKey(entrant);
      const ratioScore = medianRange > 0 ? (median - lowMedian) / medianRange : 0;
      return {
        category: entrantCategory,
        confidenceFactor: confidenceByEntrant.get(entrant) ?? 0,
        medianLapTime: median,
        name: entrant,
        ratioScore,
      };
    }),
  };

  return result;
};

export const outputHandicapsInOrder = (handicapData: EventHandicapData): void => {
  const sortedEntrants = [...handicapData.entrantData].sort((a, b) => a.ratioScore - b.ratioScore);
  console.log('Entrants sorted by handicap ratio score:');
  sortedEntrants.forEach((entrant) => {
    console.log(`Name: ${entrant.name}, Median Lap Time: ${entrant.medianLapTime.toFixed(2)}s, Ratio Score: ${entrant.ratioScore.toFixed(4)}`);
  });
};
