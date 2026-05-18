import { EventEntrantHandicapData } from './apicalData.js';
import { ExtendedApicalEventListData } from './apicalEventList.js';

export const countOccurrences = (str: string, char: string): number =>
  (str.match(new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

export const generateEventHandicapList = (events: ExtendedApicalEventListData[]): Map<string, string> => {
  const output: Map<string, string> = new Map<string, string>();

  events.forEach((d: ExtendedApicalEventListData, eventIndex: number) => {
    const eventNumber = eventIndex + 1;

    d.EventHandicapData?.entrantData.forEach((entrant: EventEntrantHandicapData) => {
      let existingVal: string = output.get(entrant.name) || '';
      let outputRound = countOccurrences(existingVal, ',') + 1;

      while (outputRound < eventNumber) {
        existingVal = existingVal + ',' + outputRound + '=::';
        outputRound = countOccurrences(existingVal, ',') + 1;
      }

      existingVal = existingVal +
        ',' + outputRound +
        '=' + entrant.ratioScore.toFixed(4) +
        ':' + entrant.medianLapTime.toFixed(0) +
        ':' + entrant.confidenceFactor.toFixed(3);
      output.set(entrant.name, existingVal);
    });

    // Pad riders who did not participate in this event so all rows stay aligned
    output.forEach((val: string, key: string) => {
      let currentRound = countOccurrences(val, ',') + 1;
      while (currentRound <= eventNumber) {
        val = val + ',' + currentRound + '=::';
        currentRound = countOccurrences(val, ',') + 1;
      }
      output.set(key, val);
    });
  });

  output.forEach((val: string, key: string) => {
    output.set(key, val.replaceAll(/[:=]/g, ','));
  });

  return output;
};
