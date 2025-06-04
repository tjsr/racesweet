
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
