import { EventEntrantHandicapData, EventHandicapData } from "./apical/apicalData.js";
import type { HandicapRiderSnapshot, HandicapRoundSnapshot, HandicapSnapshot, HandicapSnapshotEvent } from "../model/handicapSnapshot.js";

import { HandicapDataException } from "../errors/handicapDataException.js";

interface EventScalingAnchors {
  highestKnownProgressiveRatio: number;
  highestKnownRawRatio: number;
  lowestKnownProgressiveRatio: number;
  lowestKnownRawRatio: number;
}

export const getEventScalingAnchors = (
  progressiveHandicapData: Map<string, number>,
  eventHandicapData: EventHandicapData
): EventScalingAnchors | undefined => {
  const eventEntrantsByRawRatio = [...eventHandicapData.entrantData].sort((a, b) => a.ratioScore - b.ratioScore);
  const knownEntrants = eventEntrantsByRawRatio.filter((entrant) => progressiveHandicapData.has(entrant.name));

  if (knownEntrants.length < 2) {
    return undefined;
  }

  const highestKnownEntrant = knownEntrants[0];
  const lowestKnownEntrant = knownEntrants[knownEntrants.length - 1];

  if (!highestKnownEntrant || !lowestKnownEntrant || highestKnownEntrant.name === lowestKnownEntrant.name) {
    return undefined;
  }

  if (highestKnownEntrant.ratioScore < 0) {
    throw new HandicapDataException(`Highest known entrant ${highestKnownEntrant.name} has invalid raw ratio score ${highestKnownEntrant.ratioScore}`);
  }
  if (lowestKnownEntrant.ratioScore > 1.0) {
    throw new HandicapDataException(`Lowest known entrant ${lowestKnownEntrant.name} has invalid raw ratio score ${lowestKnownEntrant.ratioScore}`);
  }
  if (lowestKnownEntrant.ratioScore < 0) {
    throw new HandicapDataException(`Lowest known entrant ${lowestKnownEntrant.name} has non-positive raw ratio score ${lowestKnownEntrant.ratioScore}`);
  }
  if (highestKnownEntrant.ratioScore > 1.0) {
    throw new HandicapDataException(`Highest known entrant ${highestKnownEntrant.name} has raw ratio score greater than 1.0: ${highestKnownEntrant.ratioScore}`);
  }

  const highestKnownProgressiveRatio = progressiveHandicapData.get(highestKnownEntrant.name);
  const lowestKnownProgressiveRatio = progressiveHandicapData.get(lowestKnownEntrant.name);
  if (highestKnownProgressiveRatio !== undefined && highestKnownProgressiveRatio < 0) {
    throw new HandicapDataException(`Progressive handicap ratio for highest known entrant ${highestKnownEntrant.name} must be greater than or equal to 0, got ${highestKnownProgressiveRatio}`);
  }

  if (lowestKnownProgressiveRatio !== undefined && lowestKnownProgressiveRatio > 1.0) {
    throw new HandicapDataException(`Progressive handicap ratio for lowest known entrant ${lowestKnownEntrant.name} must be less than or equal to 1.0, got ${lowestKnownProgressiveRatio}`);
  }

  if (highestKnownProgressiveRatio === undefined || lowestKnownProgressiveRatio === undefined) {
    return undefined;
  }

  if (lowestKnownProgressiveRatio <= highestKnownProgressiveRatio) {
    return undefined;
  }

  if (lowestKnownEntrant.ratioScore <= highestKnownEntrant.ratioScore) {
    return undefined;
  }

  return {
    highestKnownProgressiveRatio,
    highestKnownRawRatio: highestKnownEntrant.ratioScore,
    lowestKnownProgressiveRatio,
    lowestKnownRawRatio: lowestKnownEntrant.ratioScore,
  };
};

export const scaleEventScore = (score: number, highestEventRatio: number, lowestEventRatio: number): number => {
  if (highestEventRatio < 0) {
    throw new HandicapDataException(`Highest event ratio ${highestEventRatio} must be greater than 0`);
  }
  if (highestEventRatio > 1.0) {
    throw new HandicapDataException(`Highest event ratio ${highestEventRatio} must be less than or equal to 1.0`);
  }
  if (lowestEventRatio < 0) {
    throw new HandicapDataException(`Lowest event ratio ${lowestEventRatio} must be greater than or equal to 0`);
  }
  if (lowestEventRatio > 1.0) {
    throw new HandicapDataException(`Lowest event ratio ${lowestEventRatio} must be less than 1.0`);
  }
  if (lowestEventRatio <= highestEventRatio) {
    throw new HandicapDataException(`Lowest event ratio ${lowestEventRatio} must be greater than highest event ratio ${highestEventRatio}`);
  }
  const scaledRange = lowestEventRatio - highestEventRatio;
  const scaledScore = (scaledRange * score) + highestEventRatio;
  return scaledScore;
};

const isDebugRider = (entrantName: string): boolean => {
  const debugRiders: string[] = [];  // 'gavin erickson', 'adrian dillon', 'nick pile'];
  return debugRiders.includes(entrantName);
};

export const normalizeBetweenAnchors = (value: number, minAnchor: number, maxAnchor: number): number => {
  if  (minAnchor >= maxAnchor) {
    throw new HandicapDataException(`minAnchor ${minAnchor} must be less than maxAnchor ${maxAnchor} (processing ${value}).`);
  }
  return (value - minAnchor) / (maxAnchor - minAnchor);
};

const isValidHandicapRatio = (ratio: number): boolean => Number.isFinite(ratio) && ratio >= 0 && ratio <= 1;

const normalizeCorrectedHandicaps = (correctedHandicaps: EventEntrantHandicapData[]): EventEntrantHandicapData[] => {
  if (correctedHandicaps.every((entrant) => isValidHandicapRatio(entrant.ratioScore))) {
    return correctedHandicaps;
  }

  const ratioScores = correctedHandicaps.map((entrant) => entrant.ratioScore);
  const lowestRatio = Math.min(...ratioScores);
  const highestRatio = Math.max(...ratioScores);

  if (!Number.isFinite(lowestRatio) || !Number.isFinite(highestRatio)) {
    throw new HandicapDataException('Corrected handicap scores must be finite before final normalization.');
  }

  if (lowestRatio === highestRatio) {
    const normalizedRatio = lowestRatio < 0 ? 0 : 1;
    return correctedHandicaps.map((entrant) => ({ ...entrant, ratioScore: normalizedRatio }));
  }

  return correctedHandicaps.map((entrant) => ({
    ...entrant,
    ratioScore: normalizeBetweenAnchors(entrant.ratioScore, lowestRatio, highestRatio),
  }));
};

const assertCorrectedHandicapsInRange = (correctedHandicaps: EventEntrantHandicapData[]): void => {
  correctedHandicaps.forEach((entrant) => {
    if (!isValidHandicapRatio(entrant.ratioScore)) {
      throw new HandicapDataException(`Scaled handicap score for ${entrant.name} is out of bounds: ${entrant.ratioScore}`);
    }
  });
};

export const scaleHandicapData = (progressiveHandicapData: Map<string, number>, eventHandicapData: EventHandicapData): EventEntrantHandicapData[] => {
  const eventAnchors = getEventScalingAnchors(progressiveHandicapData, eventHandicapData);

  const correctedHandicaps = eventHandicapData.entrantData.map(
    (value: EventEntrantHandicapData) => {
      try {
        const scaled = eventAnchors
          ? scaleEventScore(
            normalizeBetweenAnchors(value.ratioScore, eventAnchors.highestKnownRawRatio, eventAnchors.lowestKnownRawRatio),
            eventAnchors.highestKnownProgressiveRatio,
            eventAnchors.lowestKnownProgressiveRatio
          )
          : scaleEventScore(value.ratioScore, 0.0, 1.0);
        if (isDebugRider(value.name)) {
          console.debug(`Scaled score for ${value.name}=${value.ratioScore.toFixed(4)}=>${scaled.toFixed(4)}`);
        }
        return { ...value, ratioScore: scaled };
      } catch (err: unknown) {
        console.error(`Error scaling event score ${value.ratioScore} for ${value.name}:`, err);
        throw err;
      }
    });
  const normalizedHandicaps = normalizeCorrectedHandicaps(correctedHandicaps);
  assertCorrectedHandicapsInRange(normalizedHandicaps);
  return normalizedHandicaps;
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

const getSortedHandicaps = (progressiveHandicapData: Map<string, number>): ProcessedHandicapData[] => {
  const handicaps: ProcessedHandicapData[] = [];
  progressiveHandicapData.forEach((handicapTime, entrant) => {
    handicaps.push({ handicapRatio: handicapTime, name: entrant });
  });
  return handicaps.sort((a, b) => a.handicapRatio - b.handicapRatio);
};

const toNullableNumber = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') {
    return null;
  }
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const parseRoundHandicapString = (roundData: string, eventIds: number[]): Record<string, HandicapRoundSnapshot> => {
  const roundsByEventId: Record<string, HandicapRoundSnapshot> = {};
  const tokens = roundData.split(',').map((token) => token.trim());

  for (let index = 0; index < tokens.length; index += 1) {
    const roundToken = tokens[index];
    if (!/^\d+$/.test(roundToken)) {
      continue;
    }

    const eventNumber = Number(roundToken);
    const eventId = eventIds[eventNumber - 1] ?? eventNumber;
    const ratioScore = toNullableNumber(tokens[index + 1]);
    const medianLapTime = toNullableNumber(tokens[index + 2]);
    const maybeConfidenceToken = tokens[index + 3];
    const hasExplicitConfidence = maybeConfidenceToken !== undefined && !/^\d+$/.test(maybeConfidenceToken);
    const confidenceFactor = hasExplicitConfidence ? toNullableNumber(maybeConfidenceToken) : null;

    if (ratioScore !== null || medianLapTime !== null || confidenceFactor !== null) {
      roundsByEventId[String(eventId)] = {
        confidenceFactor,
        eventId,
        eventNumber,
        medianLapTime,
        ratioScore,
      };
    }

    index += hasExplicitConfidence ? 3 : 2;
  }

  return roundsByEventId;
};

const getEntrantRoundData = (entrantName: string, roundHandicapData: Map<string, string>): string => {
  const roundData = roundHandicapData.get(entrantName);
  return roundData ? roundData : 'No round data';
};

/**
 * Entrant keys are stored as `${category}-${fullName}` (all lowercase).
 * Split on the first hyphen to recover category, then split the remainder
 * on the first space to recover firstName / surname.
 */
const parseEntrantKey = (key: string): { category: string; firstName: string; surname: string } => {
  const separatorIndex = key.indexOf('-');
  if (separatorIndex === -1) {
    return { category: '', firstName: key, surname: '' };
  }
  const category = key.substring(0, separatorIndex);
  const fullName = key.substring(separatorIndex + 1);
  const spaceIndex = fullName.indexOf(' ');
  if (spaceIndex === -1) {
    return { category, firstName: fullName, surname: '' };
  }
  return {
    category,
    firstName: fullName.substring(0, spaceIndex),
    surname: fullName.substring(spaceIndex + 1),
  };
};

export const outputProcessedHandicaps = (progressiveHandicapData: Map<string, number>, roundHandicapData: Map<string, string>): void => {
  // console.log('Processed Handicap Data:');
  const handicaps = getSortedHandicaps(progressiveHandicapData);
  handicaps.forEach((entrant) => {
    const entrantRoundData = getEntrantRoundData(entrant.name, roundHandicapData);
    console.log(`${entrant.name},${entrant.handicapRatio.toFixed(4)},${entrantRoundData}`);
  });
};

export const buildHandicapSnapshot = (
  progressiveHandicapData: Map<string, number>,
  roundHandicapData: Map<string, string>,
  eventIds: number[],
  events: HandicapSnapshotEvent[] = []
): HandicapSnapshot => {
  const riders: HandicapRiderSnapshot[] = getSortedHandicaps(progressiveHandicapData).map((entrant) => {
    const { category, firstName, surname } = parseEntrantKey(entrant.name);
    return {
      category,
      firstName,
      handicapRatio: entrant.handicapRatio,
      name: entrant.name,
      roundsByEventId: parseRoundHandicapString(roundHandicapData.get(entrant.name) ?? '', eventIds),
      surname,
    };
  });

  return {
    events,
    generatedAt: new Date().toISOString(),
    riders,
    schemaVersion: '1.0',
  };
};

