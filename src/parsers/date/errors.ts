export class TimeParseError extends Error {
  constructor(reason: string, time: string) {
    super(`Invalid time format - ${reason}: ${time}`);
    this.name = 'TimeParseError';
  }
}

export class DateParseError extends Error {
  constructor(reason: string, date?: string) {
    if (date) {
      super(`Invalid date format '${date}': ${reason}.`);
    } else {
      super(`Invalid date format: ${reason}.`);
    }
    this.name = 'DateParseError';
  }
}

export class InvalidYearError extends DateParseError {
  constructor(year: string, date?: string) {
    super(`Invalid year format: '${year}'`, date);
    this.name = "InvalidYearError";
  }
}

export class InvalidMonthError extends DateParseError {
  constructor(month: string, date?: string) {
    super(`Invalid month format '${month}'`, date);
    this.name = "InvalidMonthError";
  }
}

export class InvalidDateTimeStringError extends Error {
  constructor(input: string) {
    super(`Invalid date/time format: ${input}`);
    this.name = "InvalidDateTimeStringError";
  }
}

