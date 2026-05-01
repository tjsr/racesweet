import { EventEntrantHandicapData, EventHandicapData } from "./apical/apicalData.js";

const findHighestRankedEntrant = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData): string | null => {
  let highestRankedEntrant: string | null = null;
  let lowestHandicapTime: number = Infinity;
  eventHandicapData.entrantData.forEach((entrant) => {
    const handicapTime = progressiveHandicapData.get(entrant.name);
    if (handicapTime !== undefined && handicapTime < lowestHandicapTime) {
      lowestHandicapTime = handicapTime;
      highestRankedEntrant = entrant.name;
    }
  });
  return highestRankedEntrant;
};

const findLowestRankedEntrant = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData): string | null => {
  let lowestRankedEntrant: string | null = null;
  let highestHandicapTime: number = -Infinity;
  eventHandicapData.entrantData.forEach((entrant) => {
    const handicapTime = progressiveHandicapData.get(entrant.name);
    if (handicapTime !== undefined && handicapTime > highestHandicapTime) {
      highestHandicapTime = handicapTime;
      lowestRankedEntrant = entrant.name;
    }
  }
  );
  return lowestRankedEntrant;
};

export const scaleEventScore = (score: number, highestEventRatio: number, lowestEventRatio: number): number => {
  if (highestEventRatio < 0) {
    throw new Error(`Highest event ratio ${highestEventRatio} must be greater than 0`);
  }
  if (lowestEventRatio > 1.0) {
    throw new Error(`Lowest event ratio ${lowestEventRatio} must be less than 1.0`);
  }
  if (lowestEventRatio <= highestEventRatio) {
    throw new Error(`Lowest event ratio ${lowestEventRatio} must be greater than highest event ratio ${highestEventRatio}`);
  }
  const scaledRange = lowestEventRatio - highestEventRatio;
  const scaledScore = (scaledRange * score) + highestEventRatio;
  return scaledScore;
};

const isDebugRider = (entrantName: string): boolean => {
  const debugRiders: string[] = [];  // 'gavin erickson', 'adrian dillon', 'nick pile'];
  return debugRiders.includes(entrantName);
}

const scaleHandicapData = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData): EventEntrantHandicapData[] => {
  const highestRanked = findHighestRankedEntrant(progressiveHandicapData, eventHandicapData);
  const highestEventRatio: number | undefined = highestRanked ? eventHandicapData.entrantData.find((entrant) => entrant.name === highestRanked)?.ratioScore || 0.0 : 0.0;
  const lowestRanked = findLowestRankedEntrant(progressiveHandicapData, eventHandicapData);
  const lowestEventRatio: number | undefined = lowestRanked ? eventHandicapData.entrantData.find((entrant) => entrant.name === lowestRanked)?.ratioScore || 1.0 : 1.0;

  // console.log(`Fastest rider for this event was ${highestRanked}=${highestEventRatio.toFixed(4)}, lowest was ${lowestRanked}=${lowestEventRatio.toFixed(4)}`);
  const correctedHandicaps = eventHandicapData.entrantData.map(
    (value: EventEntrantHandicapData) => {
      try {
        const scaled = scaleEventScore(value.ratioScore, highestEventRatio, lowestEventRatio);
        if (isDebugRider(value.name)) {
          console.debug(`Scaled score for ${value.name}=${value.ratioScore.toFixed(4)}=>${scaled.toFixed(4)}`);
        }
        return { ...value, ratioScore: scaled }
      } catch (err: unknown) {
        console.error(`Error scaling event score ${value.ratioScore} for ${value.name}:`, err);
        throw err;
      }
    });
  return correctedHandicaps;
};

export const processHandicaps = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData) => {
  const eventScaledHandicaps = scaleHandicapData(progressiveHandicapData, eventHandicapData);

  eventScaledHandicaps.forEach((entrant: EventEntrantHandicapData) => {
    const progressiveHandicap = progressiveHandicapData.get(entrant.name);
    if (progressiveHandicap !== undefined) {
      const updatedHandicap = (progressiveHandicap + entrant.ratioScore) / 2.0;
      progressiveHandicapData.set(entrant.name, updatedHandicap);
    } else {
      progressiveHandicapData.set(entrant.name, entrant.ratioScore);
    }
  });
};

interface ProcessedHandicapData {
  name: string;
  handicapRatio: number;
}

const getEntrantRoundData = (entrantName: string, roundHandicapData: Map<string, string>): string => {
  const roundData = roundHandicapData.get(entrantName);
  return roundData ? roundData : 'No round data';
};

export const outputProcessedHandicaps = (progressiveHandicapData: Map<string, number>, roundHandicapData: Map<string, string>): void => {
  // console.log('Processed Handicap Data:');
  let handicaps:ProcessedHandicapData[] = [];
  progressiveHandicapData.forEach((handicapTime, entrant) => {
    handicaps.push({ name: entrant, handicapRatio: handicapTime });
  });
  handicaps = handicaps.sort((a, b) => a.handicapRatio - b.handicapRatio);
  handicaps.forEach((entrant) => {
    const entrantRoundData = getEntrantRoundData(entrant.name, roundHandicapData);
    console.log(`${entrant.name},${entrant.handicapRatio.toFixed(4)},${entrantRoundData}`);
  });
};

