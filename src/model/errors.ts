import type { TimeRecord } from "./timerecord.ts";

class DataImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataImportError";
  }
}
export class ParticipantSpreadsheetError extends DataImportError {
  constructor(message: string) {
    super(message);
    this.name = "ParticipantSpreadsheetError";
  }
}

export class ColumnNotInSpreadsheetError extends ParticipantSpreadsheetError {
  constructor(message: string) {
    super(message);
    this.name = "ColumnNotInSpreadsheetError";
  }
}

class SexOrGenderDataWarning extends DataImportError {
  constructor(message: string) {
    super(message);
    this.name = "SexOrGenderDataWarning";
  }
}

export class GenderDataContainsSexDataWarning extends SexOrGenderDataWarning {
  constructor(message: string = 'Data field expecting Gender contains values for Sex - fields containing "Male|Female" should represent Sex, not Gender') {
    super(message);
    this.name = "GenderDataContainsSexDataWarning";
  }
}

export class SexDataContainsGenderDataWarning extends SexOrGenderDataWarning {
  constructor(message: string = 'Data field expecting Sex contains values for Gender - should be "Male|Female", not "Men|Women|Other".') {
    super(message);
    this.name = "SexDataContainsGenderDataWarning";
  }
}

export class InvalidTimeRecordError extends Error {
  _invalidRecords?: TimeRecord[];

  constructor(message: string, invalidRecords?: TimeRecord[]) {
    super(message);
    this.name = "InvalidTimeRecordError";
    this._invalidRecords = invalidRecords || undefined;
  }

  get invalidRecords(): TimeRecord[] | undefined {
    return this._invalidRecords;
  }
}

export class InvalidFlagRecordError extends InvalidTimeRecordError {
  constructor(message: string, invalidRecords?: TimeRecord[]) {
    super(message, invalidRecords);
    this.name = "InvalidFlagRecordError";
  }
}

export class FlagReferencesUnknownCategoryError extends InvalidFlagRecordError {
  constructor(message: string, invalidRecords?: TimeRecord[]) {
    super(message, invalidRecords);
    this.name = "FlagReferencesUnknownCategoryError";
  }
}
