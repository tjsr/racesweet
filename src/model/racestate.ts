import { DuplicateCategoryError, EventFlagsError, InvalidCategoryIdError, InvalidIdError } from "../validators/errors.ts";
import type { EventCategory, EventCategoryId } from "./eventcategory.ts";
import type { EventParticipant, EventParticipantId } from "./eventparticipant.ts";
import type { FlagRecord, GreenFlagRecord } from "./flag.ts";
import { FlagReferencesUnknownCategoryError, InvalidFlagRecordError } from "./errors.ts";
import { ParticipantNotFoundError, assignParticpantsToCrossings } from "../controllers/participant.ts";
import type { ParticipantPassingRecord, TimeRecord, TimeRecordId, Validated } from "./timerecord.ts";
import { addError, compareByTime, isCrossingRecord } from "../controllers/timerecord.ts";
import { getOrCacheGreenFlagForCategory, hasCategoryIds, isFlagRecord } from "../controllers/flag.ts";
import { processAllParticipantLaps, processParticipantLaps } from "../controllers/laps.ts";

import type { ChipCrossingData } from "./chipcrossing.ts";
import type { EventTeam } from "./eventteam.ts";
import type { MapOf } from "./types.ts";
import { crossingMatchesParticipantIdentifiers } from "../controllers/participantMatch.ts";
import { isParsedChipCrossing } from "../controllers/chipCrossing.ts";
import { isPlaceholderCatgegory } from "../controllers/category.ts";
import { isValidId } from "../validators/isValidId.ts";
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

  private __cacheParticipantLap(participantId: EventParticipantId, lap: ParticipantPassingRecord): void {
    if (!isValidId(participantId)) {
      throw new InvalidIdError(`ParticipantId ${participantId} for adding cached lap is not a valid Id type.`);
    }
    if (!this._cachedParticipantLaps) {
      this._cachedParticipantLaps = new Map<TimeRecordId, ParticipantPassingRecord[]>();
    }
    const laps = this._cachedParticipantLaps.get(participantId) || [];
    if (!laps.includes(lap)) {
      laps.push(lap);
    }
    this._cachedParticipantLaps.set(participantId.toString(), laps);
  }

  private __reprocessParticipantLaps(participantId: EventParticipantId): void {
    if (!isValidId(participantId)) {
      throw new InvalidIdError(`ParticipantId ${participantId} for reprocessing laps is not a valid Id type.`);
    }
    const participant = this.getParticipantById(participantId);
    if (!participant) {
      throw new ParticipantNotFoundError(`Participant with ID ${participantId} not found. Cannot reprocess laps.`);
    }
    const categoryStart = this.__getCategoryGreenFlag(participant.categoryId);
    if (categoryStart) {
      const participantLaps = this.getParticipantLaps(participantId);
      if (participantLaps) {
        processParticipantLaps(participant, participantLaps, categoryStart, this._minimumLapTimeMilliseconds);
        this._cachedParticipantLaps?.set(participantId, participantLaps);
      }
    }
  }

  private __validateCategory(categoryId: EventCategoryId): void {
    if (!isValidId(categoryId)) {
      throw new InvalidCategoryIdError(`CategoryId ${categoryId} for validation is not a valid Id type.`);
    }
    if (!this.categoryExists(categoryId)) {
      throw new InvalidCategoryIdError(`Category with ID ${categoryId} does not exist.`);
    }
  }

  public getCategoryParticipants(categoryId: EventCategoryId): EventParticipant[] {
    this.__validateCategory(categoryId);
    const participants: EventParticipant[] = [];
    this._participants.forEach((participant: EventParticipant) => {
      if (participant.categoryId.toString() === categoryId.toString()) {
        participants.push(participant);
      }
    });
    return participants;
  };

  private __reprocessParticipantLapsForCategory(categoryId: EventCategoryId): void {
    this.__validateCategory(categoryId);
    this.getCategoryParticipants(categoryId).forEach((participant: EventParticipant) => {
      this.__reprocessParticipantLaps(participant.id);
    });
  }

  private _processRecord(record: TimeRecord): void {
    if (isCrossingRecord(record)) {
      if (isParsedChipCrossing(record as ChipCrossingData)) {
        this.__cacheTransponderCrossing(record as ChipCrossingData);
      }
      assignParticpantsToCrossings(this._participants, [record]);
      
      if (record.participantId) {
        this.__cacheParticipantLap(record.participantId, record as ParticipantPassingRecord);
        this.__reprocessParticipantLaps(record.participantId);
      } else {
        console.warn(`Record ${record.id} has no participant ID. Skipping.`);
      }
    } else if (isFlagRecord(record)) {
      this._validateFlagRecord(record);
      if (record.categoryIds) {
        record.categoryIds.forEach((categoryId: EventCategoryId) => {
          this.__reprocessParticipantLapsForCategory(categoryId);
        });
      } else {
        this.__reprocessAllParticipantLaps();
      }
    }
    
    return;
  }

  public categoryExists(categoryId: EventCategoryId): boolean {
    if (!isValidId(categoryId)) {
      throw new InvalidIdError(`CategoryId ${categoryId} for category existence check is not a valid Id type.`);
    }
    return this._categories.has(categoryId.toString());
  }

  private _validateFlagRecord(record: FlagRecord): boolean {
    if (!isFlagRecord(record)) {
      throw new InvalidFlagRecordError(`Record ${record} is not a valid FlagRecord.`);
    }

    if (!hasCategoryIds(record)) {
      return true;
    }

    record.categoryIds?.forEach((id: EventCategoryId) => {
      if (!this.categoryExists(id)) {
        throw new FlagReferencesUnknownCategoryError(`Flag record ${record.id} references non-existent category ID ${id}.`);
      }
    });
    return true;
  }

  private _validateRecords(records: TimeRecord[]): void {
    if (!Array.isArray(records)) {
      throw new TypeError(`Expected records to be an array, but got ${typeof records}`);
    }

    const invalidRecords: Validated<TimeRecord>[] = [];
    records.forEach((record: TimeRecord) => {
      if (isFlagRecord(record)) {
        try {
          this._validateFlagRecord(record);
        } catch (error: unknown) {
          if (error instanceof InvalidFlagRecordError) {
            const validatedRecord = addError(record, error);
            invalidRecords.push(validatedRecord);
          }
          throw error;
        }
      }
    });

    if (invalidRecords.length > 0) {
      throw new InvalidFlagRecordError(
        `Invalid records found: ${invalidRecords.map((r) => r.id).join(", ")}`,
        invalidRecords);
    }
  }

  public async addRecords(records: TimeRecord[], validate: boolean = true): Promise<void> {
    try {
      this._validateRecords(records);
    } catch (error: unknown) {
      if (validate) {
        throw error;
      }
    }

    records.forEach((record: TimeRecord) => {
      if (!isValidId(record.id)) {
        throw new InvalidIdError(`Record ID ${record.id} is not a valid Id type.`);
      }
      this._records.set(record.id.toString(), record);

      if (!this._bulkProcess) {
        this._processRecord(record);
      }
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

  public async addCategories(categories: EventCategory[]): Promise<Set<EventCategoryId>|null> {
    let addedIds: Set<EventCategoryId>|null = null;
    // let placeholderCategoryParticipants: EventParticipant[]|null = null;

    if (!this._bulkProcess) {
      addedIds = new Set<EventCategoryId>();
      // placeholderCategoryParticipants = this.__findParticipantsWithPlaceholderCategories();
    }

    categories.forEach((category: EventCategory) => {
      if (!isValidId(category.id) && category.id) {
        throw new InvalidCategoryIdError(`Category ID ${category.id} is invalid while adding category to session.`);
      }
      const existing = this._categories.get(category.id.toString());
      if (existing) {
        throw new DuplicateCategoryError(`Category with ID ${category.id} (${category.name}) already exists as ${existing.name}.`);
      }
      this._categories.set(category.id.toString(), category);

      if (addedIds) {
        addedIds.add(category.id);
        try {
          this.__getCategoryGreenFlag(category.id);
        } catch (_error: unknown) {
          // This is okay at this time - categories can be added without flags existing.
        }
      }
    });
    return Promise.resolve(addedIds || null);
  }

  private __findParticipantsWithPlaceholderCategories(): EventParticipant[] {
    return this.participants.filter((participant: EventParticipant) => {
      if (!participant.categoryId) {
        return false;
      }
      if (!isValidId(participant.categoryId)) {
        console.warn(`Participant ${participant.firstname} ${participant.surname} has invalid category ID: ${participant.categoryId}`);
        return false;
      }
      const category = this.getCategoryById(participant.categoryId);
      if (!category) {
        console.warn(`CategoryID ${participant.categoryId} for participant ${participant.firstname} ${participant.surname} does not exist.`);
        return false;
      }
      return isPlaceholderCatgegory(category);
    });
  };
  // private _reprocessBarrier: Promise<void>;
  // private _nextReprocessEvent: number | undefined = undefined;

  // private scheduleReprocess(): void {
  //   const promise = new Promise<number>();
  //   this._reprocessWaits.push()
  // }

  private __reprocessAllParticipantLaps(): void {
    const processedLaps: Map<EventParticipantId, ParticipantPassingRecord[]> = processAllParticipantLaps(
      this.records, this._participants, this._minimumLapTimeMilliseconds, true // silence warnigns
    );

    this._cachedParticipantLaps = processedLaps;
  }

  private __getCategoryGreenFlag(categoryId: EventCategoryId): GreenFlagRecord | null {
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
        this._participants.set(participant.id.toString(), participant);
      } else {
        console.error(`Participant has no ID:`, participant);
      }

      const minimumLapTimeMilliseconds = this._minimumLapTimeMilliseconds || 60000; // Default to 60 seconds if not set

      const affectedCrossings = this._records.values().filter((record) => crossingMatchesParticipantIdentifiers(participant, record)).map((record) => record as ParticipantPassingRecord);
      if (this._bulkProcess) {
        return; // If bulk processing, we will handle this later
      }

      let participantCategoryStartFlag: GreenFlagRecord | null | undefined;
      try {
        participantCategoryStartFlag = this.__getCategoryGreenFlag(participant.categoryId);
      } catch (error: unknown) {
        if (error instanceof EventFlagsError) {
          // do nothing - it's okay for participants to not have a start flag when adding.
        } else {
          console.error(`Error processing participant laps for ${participant.firstname} ${participant.surname}:`, error);
          throw error;
        }
      }
      
      if (participantCategoryStartFlag) {
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
      this.__reprocessAllParticipantLaps();
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

  private __cacheTransponderCrossing(dataRecord: ChipCrossingData): void {
    if (!isParsedChipCrossing(dataRecord)) {
      console.error(this.__cacheTransponderCrossing.name, `Data record ${dataRecord.id} is not a valid ChipCrossingData.`, dataRecord);
      throw new Error(`Data record ${dataRecord.id} is not a valid ChipCrossingData.`);
    }
    if (!this._cachedTransponderCrossings) {
      this._cachedTransponderCrossings = new Map<ChipCrossingData["chipCode"], ChipCrossingData[]>();
    }
    let txCrossings = this._cachedTransponderCrossings.get(dataRecord.chipCode);
    if (!txCrossings) {
      txCrossings = [dataRecord];
      this._cachedTransponderCrossings.set(dataRecord.chipCode, txCrossings);
    } else if (!txCrossings.includes(dataRecord)) {
      txCrossings.push(dataRecord);
    }
  }

  private cacheTransponderCrossings(txNo: ChipCrossingData["chipCode"]): void {
    const crossings: ChipCrossingData[] = [];
    if (!this._cachedTransponderCrossings) {
      this._cachedTransponderCrossings = new Map<ChipCrossingData["chipCode"], ChipCrossingData[]>();
    }

    this._records.values().forEach((record: TimeRecord) => {
      const chipCrossing: ChipCrossingData = record as ChipCrossingData;
      if (isParsedChipCrossing(chipCrossing)) {
        if (chipCrossing.chipCode === txNo) {
          crossings.push(chipCrossing);
        }
      }
    });
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
