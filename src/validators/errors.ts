import type { EventParticipantId } from '../model/eventparticipant.ts';

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

export class ParticipantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipantError';
  }
}

export class NoParticipantError extends ParticipantError {
  constructor(message: string) {
    super(message);
    this.name = 'NoParticipantError';
  }
}

export class ParticipantNotFoundError extends ParticipantError {
  constructor(participantId: EventParticipantId, message: string = `Participant with ID ${participantId} not found`) {
    super(message);
    this.name = 'ParticipantNotFoundError';
  }
}

export class InvalidCrossingError extends TimeRecordError {
  constructor(message: string = 'Invalid crossing record') {
    super(message);
    this.name = 'InvalidCrossingError';
  }
}

export class NoCrossingError extends InvalidCrossingError {
  constructor(message: string = 'No crossing record provided') {
    super(message);
    this.name = 'NoCrossingError';
  }
}

export class SessionStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionStateError';
  }
}
