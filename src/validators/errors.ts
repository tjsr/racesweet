
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

export class NoEventFlagsError extends TimeRecordError {
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
