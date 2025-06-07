import type { EventCategory, EventCategoryId } from "./eventcategory.ts";
import type { EventParticipant, EventParticipantId } from "./eventparticipant.ts";
import type { FlagRecord, GreenFlagRecord } from "./flag.ts";
import type { ParticipantPassingRecord, TimeRecord, TimeRecordId } from "./timerecord.ts";
import { getOrCacheGreenFlagForCategory, isFlagRecord } from "../controllers/flag.ts";
import { processAllParticipantLaps, processParticipantLaps } from "../controllers/laps.ts";

import type { ChipCrossingData } from "./chipcrossing.ts";
import type { EventTeam } from "./eventteam.ts";
import { InvalidIdError } from "../validators/errors.ts";
import type { MapOf } from "./types.ts";
import { assignParticpantsToCrossings } from "../controllers/participant.ts";
import { compareByTime } from "../controllers/timerecord.ts";
import { crossingMatchesParticipantIdentifiers } from "../controllers/participantMatch.ts";
import { isParsedChipCrossing } from "../controllers/chipCrossing.ts";
import { listToMap } from "../utils.ts";

export interface RaceStateLookup {
  getParticipantById(participantId: EventParticipantId): EventParticipant | undefined;
  getCategoryById(categoryId: EventCategoryId): EventCategory | undefined;
  getParticipantLaps(participantId: EventParticipantId): ParticipantPassingRecord[] | null | undefined;
  countTransponderCrossings(txNo: ChipCrossingData['chipCode'], untilTime?: Date): number;
  getTransponderCrossings(txNo: ChipCrossingData['chipCode'], untilTime?: Date): ChipCrossingData[];
}

export interface RaceState {
  records: TimeRecord[];
  participants: EventParticipant[];
  categories: EventCategory[];
  teams: EventTeam[];
}

export type ErrorType = string | Error;

export class Session implements RaceState, RaceStateLookup {
  private _records!: MapOf<TimeRecord>;
  private _participants!: MapOf<EventParticipant>;
  private _categories!: MapOf<EventCategory>;
  private _teams!: MapOf<EventTeam>;
  private _cachedParticipantLaps: Map<TimeRecordId, ParticipantPassingRecord[]> | undefined;
  // private __currentBulkProcess: Barrier<void>|undefined;
  private _bulkProcess: boolean = false;
  private _categoryGreenFlags: Map<EventCategoryId, GreenFlagRecord> | undefined;
  private _minimumLapTimeMilliseconds: number | undefined = 60000;
  private _cachedTransponderCrossings: Map<ChipCrossingData["chipCode"], ChipCrossingData[]>;

  public constructor(state: RaceState) {
    this._categories = listToMap(state.categories);
    this._participants = listToMap(state.participants);
    this._teams = listToMap(state.teams);
    this._records = listToMap(state.records);
    this._cachedTransponderCrossings = new Map<ChipCrossingData["chipCode"], ChipCrossingData[]>();
  }

  public get records(): TimeRecord[] {
    return [...this._records.values()].sort(compareByTime);
  }
  
  public get participants(): EventParticipant[] {
    return [...this._participants.values()];
  }
   
  public get categories(): EventCategory[] {
    return [...this._categories.values()];
  }

  public get teams(): EventTeam[] {
    return [...this._teams.values()];
  };


  public async beginBulkProcess(): Promise<boolean> {
    this._bulkProcess = true;
    // this.__currentBulkProcess = this.__currentBulkProcess || Promise.resolve();
    // // const onComplete = (resolve: () => void) => {
    // //   resolve();
    // // };

    // const newPromise = new Barrier<void>((resolve, _reject) => {
    //   this.__currentBulkProcess!.then(resolve); 
    //   this.__currentBulkProcess = newPromise;
    // });
    // return newPromise;
    return Promise.resolve(true);
  }

  public async endBulkProcess(): Promise<void> {
    return Promise.resolve(true).then(() => {
      assignParticpantsToCrossings(this._participants, this.records);
      const processedLaps: Map<EventParticipantId, ParticipantPassingRecord[]> = processAllParticipantLaps(
        this.records, this._participants
      );

      this._cachedParticipantLaps = processedLaps;
      this._bulkProcess = false;
    });
  };

  public getCategoryById(categoryId: EventCategoryId): EventCategory | undefined {
    if (!isValidId(categoryId)) {
      throw new InvalidIdError(`ParticipantId ${categoryId} for category lookup by Id is not a valid Id type.`);
    }
    return this._categories.get(categoryId);
  }

  public getParticipantById(participantId: EventParticipantId): EventParticipant | undefined {
    if (!isValidId(participantId)) {
      throw new InvalidIdError(`ParticipantId ${participantId} for participant lookup by Id is not a valid Id type.`);
    }
    return this._participants.get(participantId);
  }

  // public getCategoryStartFlag(categoryId: EventCategoryId): FlagRecord | undefined {
  //   const category = this.getCategoryById(categoryId);
  //   if (!category) {
  //     return undefined;
  //   }

  //   const startFlag = this.flags.find((flag) => flag.categoryId === categoryId && flag.type === 'start');

  public async process(): Promise<void> {
    return Promise.resolve();
    // return this.__currentBulkProcess?.release() || Promise.resolve();
  }

  public addRecords(records: TimeRecord[]) {
    records.forEach((record) => {
      this._records.set(record.id, record);
      // addTimeRecord(targetArray, startFlagA);
    });
  }

  public getParticipantLaps(participantId: EventParticipantId): ParticipantPassingRecord[] | null | undefined {
    if (!isValidId(participantId)) {
      throw new InvalidIdError(`ParticipantId ${participantId} for lookup is not a valid Id type.`);
    }
    if (!this._cachedParticipantLaps) {
      console.warn("Participant laps have not been processed yet. Please call addParticipants first.");
      return undefined;
    }
    return this._cachedParticipantLaps.get(participantId) ?? null;
  }

  public addCategories(categories: EventCategory[]): void {
    categories.forEach((category) => {
      if (!isValidId(category.id)) {
        throw new InvalidIdError(`Category ID ${category.id} is invalid while adding category to session.`);
      }
      if (category.id) {
        this._categories.set(category.id, category);
      } else {
        console.error(`Category has no ID:`, category);
      }
    });
  }

  // private _reprocessBarrier: Promise<void>;
  // private _nextReprocessEvent: number | undefined = undefined;

  // private scheduleReprocess(): void {
  //   const promise = new Promise<number>();
  //   this._reprocessWaits.push()
  // }

  private getCategoryGreenFlag(categoryId: EventCategoryId): GreenFlagRecord | null {
    const flags = this.flags;
    if (this._categoryGreenFlags === undefined) {
      this._categoryGreenFlags = new Map<EventCategoryId, GreenFlagRecord>();
    }

    const categoryStartFlag: GreenFlagRecord | null = getOrCacheGreenFlagForCategory(
      categoryId,
      flags,
      this._categoryGreenFlags
    );
    return categoryStartFlag;
  }

  public addParticipants(participants: EventParticipant[]): void {
    participants.forEach((participant) => {
      if (this._participants.has(participant.id)) {
        console.warn(`Participant with ID ${participant.id} already exists. Skipping duplicate.`);
        return;
      }
      if (participant.id) {
        this._participants.set(participant.id, participant);
      } else {
        console.error(`Participant has no ID:`, participant);
      }

      const minimumLapTimeMilliseconds = this._minimumLapTimeMilliseconds || 60000; // Default to 60 seconds if not set

      const affectedCrossings = this._records.values().filter((record) => crossingMatchesParticipantIdentifiers(participant, record)).map((record) => record as ParticipantPassingRecord);
      if (this._bulkProcess) {
        return; // If bulk processing, we will handle this later
      }
      const participantCategoryStartFlag: GreenFlagRecord | null | undefined = this.getCategoryGreenFlag(participant.categoryId);
      if (participantCategoryStartFlag) {
      // validateParticipantStartFlag(participantCategoryStartFlag, participant);
        processParticipantLaps(participant, [...affectedCrossings], participantCategoryStartFlag!, minimumLapTimeMilliseconds);
      }
      affectedCrossings.forEach((crossing: ParticipantPassingRecord) => {
        crossing.participantId = participant.id;
        crossing.participantStartRecordId = participantCategoryStartFlag?.id;
        // crossing.
      });
    });

    // If you want to get the rows with no valid time, assign the result to a variable:
    // const rowsWithNoTime = event.records.filter(noTimeRecordFilter);
    // console.log('Rows with no time:', rowsWithNoTime.length);

    // noTimeRecordFilter();
    // const eventStartTime = new Date('2025-03-03T19:01:20');
    // const eventEndTime = new Date('2025-03-03T20:10:00');

    // const validTimes = Array.from(
    //   this._records.values()
    //     .filter(record => record.time && isBetween(record.time, eventStartTime, eventEndTime)))
    //   .sort(compareByTime);
    // console.log('Unmatched entries:', unmatchedEntries);
    // this._records.entries().filter((record) => !rowsWithNoTime.includes(record));
    
    // .forEach(([id, record]) => {
    // export let validTimes = event.records.filter((record) => !rowsWithNoTime.includes(record));
    // validTimes = filterToEventsBetween(validTimes, eventStartTime, eventEndTime);
    // console.log('Valid times:', validTimes.length);
    // const sortedTimeRecords: TimeRecord[] = validTimes.sort(compareByTime);

    // return scheduleReprocess();
    // setTimeout(() => {
    //   this.processLaps();
    //   console.log('Executing delayed operation...');
    //   // Add your logic here
    // }, 1000); // Timeout in milliseconds (e.g., 1000ms = 1 second)

    // Don't need to do this if done during add loop
    // assignParticpantsToCrossings(this._participants, validTimes);

    // export const processedLaps: Map<EventParticipantId, ParticipantPassingRecord[]> = 
    if (!this._bulkProcess) {
      const processedLaps: Map<EventParticipantId, ParticipantPassingRecord[]> = processAllParticipantLaps(
        this.records, this._participants
      );

      this._cachedParticipantLaps = processedLaps;
    }
  }

  public get flags(): FlagRecord[] {
    const flags: FlagRecord[] = [];
    this._records.values().forEach((record: TimeRecord) => {
      if (isFlagRecord(record)) {
        flags.push(record as FlagRecord);
      }
    });
    return flags;
  }

  private cacheTransponderCrossings(txNo: ChipCrossingData["chipCode"]): void {
    const crossings: ChipCrossingData[] = [];
    this._records.values().forEach((record: TimeRecord) => {
      const chipCrossing: ChipCrossingData = record as ChipCrossingData;
      if (isParsedChipCrossing(chipCrossing)) {
        if (chipCrossing.chipCode === txNo) {
          crossings.push(chipCrossing);
        }
      }
    });
    if (!this._cachedTransponderCrossings) {
      this._cachedTransponderCrossings = new Map<ChipCrossingData["chipCode"], ChipCrossingData[]>();
    }
    this._cachedTransponderCrossings.set(txNo, crossings);
  };

  public getTransponderCrossings(txNo: ChipCrossingData["chipCode"], untilTime?: Date): ChipCrossingData[] {
    if (!this._cachedTransponderCrossings.has(txNo)) {
      this.cacheTransponderCrossings(txNo);
    }
    let crossings: ChipCrossingData[] = this._cachedTransponderCrossings.get(txNo) || [];
    if (untilTime) {
      crossings = crossings.filter((crossing) => {
        if (crossing.time === undefined) {
          return false;
        }
        return crossing.time.getTime() <= untilTime.getTime();
      });
    }
    return crossings;
  }

  public countTransponderCrossings(txNo: ChipCrossingData["chipCode"], untilTime?: Date): number {
    const crossings = this.getTransponderCrossings(txNo, untilTime);
    return crossings.length;
  }
}
