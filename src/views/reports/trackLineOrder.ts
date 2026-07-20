import type { EventTrackTimingLine } from '../../catalog/eventCatalog.js';
import { getPassingLineNumber } from '../../controllers/laps.js';
import { isCrossingRecord } from '../../controllers/timerecord.js';
import type { RaceState, RaceStateLookup } from '../../model/racestate.js';
import type { ParticipantPassingRecord } from '../../model/timerecord.js';

export const checkTrackTimingLineOrder = (
  raceState: RaceState & RaceStateLookup,
  timingLines: EventTrackTimingLine[],
): string[] => {
  const orderedLines = [...timingLines].sort((left, right) => left.progress - right.progress);
  if (orderedLines.length < 2) {
    return [];
  }
  const lineIndexByNumber = new Map(orderedLines.map((line, index) => [line.lineNumber, index]));
  const lineByNumber = new Map(orderedLines.map((line) => [line.lineNumber, line]));
  const formatLine = (lineNumber: number): string => {
    const label = lineByNumber.get(lineNumber)?.label?.trim();
    return label ? `Line ${lineNumber} (${label})` : `Line ${lineNumber}`;
  };
  const crossingsByCompetitor = new Map<string, ParticipantPassingRecord[]>();

  raceState.records.filter(isCrossingRecord).forEach((crossing) => {
    const lineNumber = getPassingLineNumber(crossing);
    const competitorId = crossing.participantId || crossing.entryId || crossing.entrantId;
    if (lineNumber === undefined || !competitorId || !lineIndexByNumber.has(lineNumber) || !crossing.time) {
      return;
    }
    const crossings = crossingsByCompetitor.get(competitorId.toString()) || [];
    crossings.push(crossing);
    crossingsByCompetitor.set(competitorId.toString(), crossings);
  });

  const invalidTransitions = new Map<string, { after: number; before: number; count: number }>();
  crossingsByCompetitor.forEach((crossings) => {
    crossings.sort((left, right) => left.time!.getTime() - right.time!.getTime());
    crossings.slice(1).forEach((crossing, index) => {
      const previousLine = getPassingLineNumber(crossings[index]!);
      const nextLine = getPassingLineNumber(crossing);
      if (previousLine === undefined || nextLine === undefined || previousLine === nextLine) {
        return;
      }
      const previousIndex = lineIndexByNumber.get(previousLine);
      const nextIndex = lineIndexByNumber.get(nextLine);
      if (previousIndex === undefined || nextIndex === undefined) {
        return;
      }
      const isNormalWrap = previousIndex === orderedLines.length - 1 && nextIndex === 0;
      if (nextIndex > previousIndex || isNormalWrap) {
        return;
      }
      const key = `${nextLine}:${previousLine}`;
      const current = invalidTransitions.get(key) || { after: previousLine, before: nextLine, count: 0 };
      current.count += 1;
      invalidTransitions.set(key, current);
    });
  });

  return Array.from(invalidTransitions.values()).map((transition) => (
    `${formatLine(transition.before)} appears after ${formatLine(transition.after)} on the map, but should be before ${formatLine(transition.after)} (${transition.count} observed crossing${transition.count === 1 ? '' : 's'}).`
  ));
};
