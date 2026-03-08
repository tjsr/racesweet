import { EventHandicapData } from "./apical/apicalData.ts";

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

const scaleHandicapData = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData) => {
  const highestRanked = findHighestRankedEntrant(progressiveHandicapData, eventHandicapData);
  const highestEventRatio: number|undefined = highestRanked ? eventHandicapData.entrantData.find((entrant) => entrant.name === highestRanked)?.ratioScore || undefined : undefined;
  const lowestRanked = findLowestRankedEntrant(progressiveHandicapData, eventHandicapData);
  const lowestEventRatio: number|undefined = lowestRanked ? eventHandicapData.entrantData.find((entrant) => entrant.name === lowestRanked)?.ratioScore || undefined : undefined;

  if (highestRanked && lowestRanked && highestEventRatio !== undefined && lowestEventRatio !== undefined) {
    const progressiveRange = lowestEventRatio - highestEventRatio;


    const eventRange = lowestEventRatio - highestEventRatio;
    const scaleFactor = progressiveRange / eventRange;
    
    eventHandicapData.entrantData.forEach((entrant) => {
      scaoeEventScore(entrant.ratioScore, highestEventRatio, lowestEventRatio, )
      if (!progressiveHandicapData.has(entrant.name)) {
        progressiveHandicapData.set(entrant.name, entrant.ratioScore);
        return;
      }
      const scaledHandicap = (entrant.ratioScore - highestEventRatio) * scaleFactor + progressiveHandicapData.get(highestRanked)!;
      progressiveHandicapData.set(entrant.name, scaledHandicap);
    });
  }

  const allHandicapTimes = eventHandicapData.entrantData.flatMap((entrant) => entrant.handicapTimes);
  const existingRankedParticipants = progressiveHandicapData.filter()
  const maxHandicapTime = Math.max(...allHandicapTimes);
  const minHandicapTime = Math.min(...allHandicapTimes);

export const processHandicaps = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData) => {
  scaleHandicapData(progressiveHandicapData, eventHandicapData);


  eventHandicapData.entrantData.forEach((entrant) => {
    const existingEntrant = outputHandicapData.find((e) => e.entrantName === entrant.entrantName);
    if (existingEntrant) {
      existingEntrant.handicapTimes.push(...entrant.handicapTimes);
    } else {
      outputHandicapData.push({
        entrantName: entrant.entrantName,
        handicapTimes: [...entrant.handicapTimes],
      });
    }
  });
};
