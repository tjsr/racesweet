import { ApicalSpreadsheetLapsRow } from "./apicalEventSpreadsheet.js";

const MIN_LAPS_FOR_MEDIAN_RESULT = 3;

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
  name: string;
  category: string;
  medianLapTime: number;
  ratioScore: number;
}

export const calculateEventHandicapData = (event: { Id: number; Name: string }, lapsData: ApicalSpreadsheetLapsRow[]): EventHandicapData => {
  const entrantLapTimes: Map<string, number[]> = getEntrantLapTimeMap(lapsData);
  const medianLaps: Map<string, number> = getAllMedianLapTimes(entrantLapTimes);
  const medianValues: number[] = Array.from(medianLaps.values());
  const lowMedian = Math.min(...medianValues);
  const highMedian = Math.max(...medianValues);

  const result: EventHandicapData = {
    entrantData: Array.from(medianLaps.entries()).map(([entrant, median]) => {
      const entrantCategory: string = lapsData.find(
        (lap: ApicalSpreadsheetLapsRow) => {
          console.log(lap.FullName + '=>' + lap.CategoryName);
          return lap.FullName.toLowerCase() === entrant;
        }
      )?.CategoryName || 'Unknown';
      const ratioScore = (median - lowMedian) / (highMedian - lowMedian);
      return {
        medianLapTime: median,
        name: entrant,
        category: entrantCategory,
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
