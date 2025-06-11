
class TimeRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeRecordError';
  }
}

export class IllegalTimeRecordError extends TimeRecordError {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalTimeRecordError';
  }
}

class StartFlagError extends TimeRecordError {
  constructor(message: string) {
    super(message);
    this.name = 'StartFlagError';
  }
}

export class ParticipantStartFlagError extends StartFlagError {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantStartFlagError';
  }
}

export class NoStartFlagError extends ParticipantStartFlagError {
  constructor(message: string) {
    super(message);
    this.name = 'NoStartFlagError';
  }
}

export class EventFlagsError extends TimeRecordError {
  constructor(message: string) {
    super(message);
    this.name = 'EventFlagsError';
  }
}

export class NoEventFlagsError extends EventFlagsError {
  constructor(message: string) {
    super(message);
    this.name = 'NoEventFlagsError';
  }
}

export class StartFlagHasNoTimeError extends ParticipantStartFlagError {
  constructor(message: string) {
    super(message);
    this.name = 'StartFlagHasNoTimeError';
  }
}

export class InvalidIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIdError';
  }
}

export class CategoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CategoryError';
  }
}

export class DuplicateCategoryError extends CategoryError {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateCategoryError';
  }
}

export class InvalidCategoryIdError extends InvalidIdError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCategoryIdError';
  }
}
